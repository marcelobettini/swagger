// JWT + orquestación de sesión. Usa userService para leer/escribir el
// estado de refresh token -nunca toca el modelo User directamente-, y
// utils/cookies.js para escribir las cookies de respuesta. No conoce nada
// de Express más allá del objeto `res` que le pasan para setear cookies.
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import * as userService from "./userService.js";
import { setAccessCookie, setRefreshCookie } from "../utils/cookies.js";

// TTLs hardcodeados acá (no en .env) a propósito: tienen que coincidir
// siempre con el maxAge de las cookies en src/utils/cookies.js. Si se
// externalizaran a variables de entorno independientes, cambiar una sin
// la otra dejaría un JWT válido por más tiempo del que dura su cookie (o
// viceversa) -una fuente de bugs difícil de notar. Tampoco son un valor
// que típicamente varíe por entorno de despliegue, a diferencia de
// PORT/DB_NAME/los secrets. Si se cambian acá, hay que actualizar también
// ACCESS_MAX_AGE_MS/REFRESH_MAX_AGE_MS en src/utils/cookies.js.
const ACCESS_TOKEN_TTL_SECONDS = 5; // TEMP para probar silent refresh — revertir a 15*60
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 días

// Fallback SOLO pensado para desarrollo sin .env (mantiene el "cero config"
// que ya tiene el repo con PORT/DB_NAME). En NODE_ENV=production, src/index.js
// verifica al arrancar que las env vars reales estén seteadas y aborta el
// arranque si faltan -este fallback nunca debería usarse fuera de dev.
const INSECURE_DEV_ACCESS_SECRET = "dev-insecure-access-secret-change-me";
const INSECURE_DEV_REFRESH_SECRET = "dev-insecure-refresh-secret-change-me";

// Cacheamos si ya avisamos por consola para no repetir el warning en cada
// request (getAccessSecret/getRefreshSecret se llaman en cada verificación).
let warnedAccess = false;
let warnedRefresh = false;

function getAccessSecret() {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (secret) return secret;
    if (!warnedAccess) {
        console.warn(
            "[auth] JWT_ACCESS_SECRET no está seteado: usando un secreto de desarrollo inseguro. No usar en producción."
        );
        warnedAccess = true;
    }
    return INSECURE_DEV_ACCESS_SECRET;
}

function getRefreshSecret() {
    const secret = process.env.JWT_REFRESH_SECRET;
    if (secret) return secret;
    if (!warnedRefresh) {
        console.warn(
            "[auth] JWT_REFRESH_SECRET no está seteado: usando un secreto de desarrollo inseguro. No usar en producción."
        );
        warnedRefresh = true;
    }
    return INSECURE_DEV_REFRESH_SECRET;
}

function signAccessToken(userId) {
    return jwt.sign({ sub: userId }, getAccessSecret(), { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
}

function signRefreshToken(userId) {
    // jti solo informativo/trazable en logs; la validez real se decide por
    // el hash guardado en User.refreshTokenHash, no por este campo.
    return jwt.sign({ sub: userId, jti: crypto.randomUUID() }, getRefreshSecret(), {
        expiresIn: REFRESH_TOKEN_TTL_SECONDS,
    });
}

// Nunca tira: jsonwebtoken lanza TokenExpiredError/JsonWebTokenError/etc.,
// y attachUser (el único consumidor indirecto de esto) tiene contrato de
// "nunca tira, siempre next()". Encapsulamos el try/catch acá una sola vez.
function safeVerify(token, secret) {
    try {
        return { valid: true, expired: false, payload: jwt.verify(token, secret) };
    } catch (err) {
        return { valid: false, expired: err.name === "TokenExpiredError", payload: null };
    }
}

function verifyAccessToken(token) {
    return safeVerify(token, getAccessSecret());
}

function hashRefreshToken(token) {
    // SHA-256 y no bcrypt: bcrypt trunca inputs de más de 72 bytes (un JWT
    // los supera fácil), lo que generaría colisiones entre tokens distintos
    // con el mismo prefijo. El refresh token ya tiene alta entropía por ser
    // generado por el server (a diferencia de un password humano), así que
    // no hace falta el costo computacional de bcrypt para este caso.
    return crypto.createHash("sha256").update(token).digest("hex");
}

// Genera un par de tokens nuevo, persiste el hash del refresh en DB y
// escribe ambas cookies en la response. Usado por login y por la rotation
// silenciosa de attachUser.
async function issueSession(user, res) {
    const userId = (user._id ?? user.id).toString();
    const accessToken = signAccessToken(userId);
    const refreshToken = signRefreshToken(userId);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);

    await userService.setRefreshToken(userId, hashRefreshToken(refreshToken), expiresAt);
    setAccessCookie(res, accessToken);
    setRefreshCookie(res, refreshToken);

    return { userId };
}

// Intenta renovar la sesión a partir del refresh token presentado. Nunca
// tira: devuelve null si por cualquier motivo no se puede renovar (JWT
// inválido/expirado, usuario inexistente, sesión ya cerrada, o el token no
// matchea el hash vigente -ver decisión de diseño #8: en este último caso
// NO se revoca la sesión activa, solo se rechaza este intento puntual,
// porque un mismatch también puede ser una carrera benigna entre dos
// requests casi simultáneas del mismo usuario).
async function rotateSession(presentedToken, res) {
    if (!presentedToken) return null;

    const { valid, payload } = safeVerify(presentedToken, getRefreshSecret());
    if (!valid || !payload?.sub) return null;

    const user = await userService.findByIdWithRefreshState(payload.sub);
    if (!user || !user.refreshTokenHash) return null;

    const presented = Buffer.from(hashRefreshToken(presentedToken), "hex");
    const stored = Buffer.from(user.refreshTokenHash, "hex");
    const matches = presented.length === stored.length && crypto.timingSafeEqual(presented, stored);
    if (!matches) return null;

    return issueSession(user, res);
}

async function revokeSession(userId) {
    await userService.clearRefreshToken(userId);
}

export {
    signAccessToken,
    signRefreshToken,
    safeVerify,
    verifyAccessToken,
    hashRefreshToken,
    issueSession,
    rotateSession,
    revokeSession,
};
