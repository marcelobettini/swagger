// JWT + emisión de sesión. No conoce nada de Express más allá del objeto
// `res` que le pasan para setear la cookie. Sesión = un único access token
// (JWT), sin estado server-side: no hay refresh token, no hay nada que
// persistir en el User ni nada que revocar en DB al hacer logout.
import jwt from "jsonwebtoken";
import { setAccessCookie } from "../utils/cookies.js";

// TTL hardcodeado acá (no en .env) a propósito: tiene que coincidir siempre
// con el maxAge de la cookie en src/utils/cookies.js. Si se externalizara a
// una variable de entorno independiente, cambiar una sin la otra dejaría un
// JWT válido por más tiempo del que dura su cookie (o viceversa) -una
// fuente de bugs difícil de notar. Tampoco es un valor que típicamente
// varíe por entorno de despliegue, a diferencia de PORT/DB_NAME/los
// secrets. Si se cambia acá, hay que actualizar también ACCESS_MAX_AGE_MS
// en src/utils/cookies.js.
const ACCESS_TOKEN_TTL_SECONDS = 12 * 60 * 60; // 12 horas

// Función, no const de módulo: los import se evalúan antes que el
// process.loadEnvFile() de src/index.js (mismo motivo que baseOptions() en
// src/utils/cookies.js), así que leer process.env acá arriba ignoraría en
// silencio un JWT_ACCESS_SECRET seteado solo en .env.
const INSECURE_DEV_ACCESS_SECRET = "dev-insecure-access-secret-change-me";

// Cacheamos si ya avisamos por consola para no repetir el warning en cada
// request (getAccessSecret se llama en cada sign/verify).
let warnedInsecureSecret = false;

function getAccessSecret() {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (secret) return secret;
    if (!warnedInsecureSecret) {
        console.warn(
            "[auth] JWT_ACCESS_SECRET no está seteado: usando un secreto de desarrollo inseguro. No usar en producción."
        );
        warnedInsecureSecret = true;
    }
    return INSECURE_DEV_ACCESS_SECRET;
}

function signAccessToken(userId, role) {
    return jwt.sign({ sub: userId, role }, getAccessSecret(), { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
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

// Firma el token y lo escribe en la cookie de la response. Usado solo por
// login -no hay rotation ni renovación silenciosa: cuando el token expira
// (12h), el cliente vuelve a loguearse.
function issueSession(user, res) {
    const userId = (user._id ?? user.id).toString();
    const role = user.role ?? "user";
    const accessToken = signAccessToken(userId, role);

    setAccessCookie(res, accessToken);

    return { userId, role };
}

export { signAccessToken, safeVerify, verifyAccessToken, issueSession };
