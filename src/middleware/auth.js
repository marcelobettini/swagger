// Dos middlewares de auth, separados a propósito porque resuelven identidad
// y exigen identidad son cosas distintas:
// - attachUser: nunca tira, siempre next(). Se monta global en /api/*, así
//   que corre en TODA request -incluidas las públicas (GET /tasks, POST
//   /auth/login, POST /auth/register, la doc de Swagger). Ese es justamente
//   el motivo por el que el contrato "nunca tira" importa y no es un simple
//   detalle de estilo: si lanzara ante una cookie faltante/expirada/inválida,
//   una cookie vieja bastaría para devolver 401 en rutas que ni siquiera
//   requieren estar logueado, rompiendo el modelo "GET público, POST
//   protegido" del resto de la API. attachUser solo intenta *resolver*
//   req.user a partir del accessToken cookie (JWT de 12h, sin refresh): si es
//   válido, lo setea; si no, limpia la cookie y sigue sin autenticar. No hay
//   renovación de ningún tipo acá -cuando el token expira, el cliente tiene
//   que loguearse de nuevo. Pero decidir si eso es aceptable para la ruta
//   actual no es su trabajo.
// - requireAuth: el que sí *exige* identidad, gate para rutas protegidas,
//   se monta por ruta. Asume que attachUser ya corrió antes en la cadena de
//   middlewares. Acá el throw es correcto: a esta altura la ruta ya declaró
//   que necesita un usuario autenticado, así que "no hay req.user" es un
//   error real de esa request puntual -no algo que deba degradarse como en
//   attachUser.
import { verifyAccessToken } from "../services/authService.js";
import { clearAuthCookies, ACCESS_COOKIE_NAME } from "../utils/cookies.js";
import { AppError } from "../errors/AppError.js";

export function attachUser(req, res, next) {
    try {
        const accessToken = req.cookies?.[ACCESS_COOKIE_NAME];
        if (accessToken) {
            const { valid, payload } = verifyAccessToken(accessToken);
            if (valid) {
                // ?? "user" cubre tokens firmados antes de que existiera el
                // rol: siguen siendo válidos hasta que expiren (12h), sin
                // rol en el payload.
                req.user = { id: payload.sub, role: payload.role ?? "user" };
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

// Gate para rutas de admin. Chequea !req.user acá adentro (y no solo delega
// en requireAuth) para que el middleware sea seguro por sí solo: sin esto,
// req.user.role sobre null tiraría un TypeError -> 500 en vez de un 401
// prolijo. Se monta igual encadenado con requireAuth en las rutas, siguiendo
// el estilo del resto del router.
export function requireAdmin(req, res, next) {
    if (!req.user) throw new AppError("No autenticado", 401);
    if (req.user.role !== "admin") throw new AppError("Requiere rol admin", 403);
    next();
}
