// Dos middlewares de auth:
// - attachUser: nunca tira, siempre next(). Intenta resolver req.user a
//   partir de las cookies; si el access token expiró pero el refresh es
//   válido, rota la sesión de forma transparente (nuevas cookies en la
//   response) antes de seguir. Se monta global en /api/v1/*.
// - requireAuth: gate para rutas protegidas, se monta por ruta. Asume que
//   attachUser ya corrió antes en la cadena de middlewares.
import { verifyAccessToken, rotateSession } from "../services/authService.js";
import { clearAuthCookies, ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME } from "../utils/cookies.js";
import { AppError } from "../errors/AppError.js";

export async function attachUser(req, res, next) {
    try {
        const accessToken = req.cookies?.[ACCESS_COOKIE_NAME];
        if (accessToken) {
            const { valid, payload } = verifyAccessToken(accessToken);
            if (valid) {
                req.user = { id: payload.sub };
                return next();
            }
        }

        // Sin access token válido: intentamos renovar en silencio con el
        // refresh token, si hay uno.
        const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
        const rotated = await rotateSession(refreshToken, res);
        if (rotated) {
            req.user = { id: rotated.userId };
            return next();
        }

        // No se pudo resolver ninguna sesión: limpiamos cualquier cookie
        // vieja/inválida que haya quedado y seguimos sin autenticar (las
        // rutas públicas no necesitan req.user; requireAuth se encarga de
        // cortar las que sí lo necesitan).
        clearAuthCookies(res);
        req.user = null;
        return next();
    } catch (err) {
        // Contrato de attachUser: nunca tira. Un error acá (ej. Mongo
        // momentáneamente inaccesible durante la rotation) degrada a
        // request sin autenticar en vez de tirar abajo el request entero.
        console.error("attachUser: error inesperado resolviendo la sesión:", err);
        req.user = null;
        return next();
    }
}

export function requireAuth(req, res, next) {
    if (!req.user) throw new AppError("No autenticado", 401);
    next();
}
