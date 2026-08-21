// Dos middlewares de auth:
// - attachUser: nunca tira, siempre next(). Resuelve req.user a partir del
//   accessToken cookie (JWT de 12h, sin refresh): si es válido, seteamos
//   req.user; si falta/expiró/es inválido, limpiamos la cookie y seguimos
//   sin autenticar. No hay renovación de ningún tipo acá -cuando el token
//   expira, el cliente tiene que loguearse de nuevo. Se monta global en
//   /api/*.
// - requireAuth: gate para rutas protegidas, se monta por ruta. Asume que
//   attachUser ya corrió antes en la cadena de middlewares.
import { verifyAccessToken } from "../services/authService.js";
import { clearAuthCookies, ACCESS_COOKIE_NAME } from "../utils/cookies.js";
import { AppError } from "../errors/AppError.js";

export function attachUser(req, res, next) {
    try {
        const accessToken = req.cookies?.[ACCESS_COOKIE_NAME];
        if (accessToken) {
            const { valid, payload } = verifyAccessToken(accessToken);
            if (valid) {
                req.user = { id: payload.sub };
                return next();
            }
        }

        // Sin access token válido: no hay nada más que intentar. Limpiamos
        // cualquier cookie vieja/inválida que haya quedado y seguimos sin
        // autenticar (las rutas públicas no necesitan req.user; requireAuth
        // se encarga de cortar las que sí lo necesitan).
        clearAuthCookies(res);
        req.user = null;
        return next();
    } catch (err) {
        // Contrato de attachUser: nunca tira. verifyAccessToken ya nunca
        // lanza (safeVerify captura todo internamente), pero dejamos este
        // try/catch como red de seguridad genérica -si algo cambia acá
        // adelante, degrada a request sin autenticar en vez de tirar abajo
        // el request entero.
        console.error("attachUser: error inesperado resolviendo la sesión:", err);
        req.user = null;
        return next();
    }
}

export function requireAuth(req, res, next) {
    if (!req.user) throw new AppError("No autenticado", 401);
    next();
}
