// Único lugar que arma las opciones de las cookies de sesión. login/refresh
// (vía authService) y logout (vía routes/auth.js) pasan por acá, así nunca
// se repiten ni se desincronizan las opciones entre donde se setean y donde
// se limpian (clearCookie necesita las mismas opciones exactas -sobre todo
// path- con las que se setearon, porque el browser matchea por nombre+path
// para saber cuál cookie borrar).
//
// secure/sameSite se calculan DENTRO de cada función, leyendo process.env
// en el momento de la llamada (no como const de módulo): igual que en
// src/db/mongoClient.js, los import se evalúan antes que el
// process.loadEnvFile() de src/index.js, así que una const de módulo
// ignoraría silenciosamente lo que haya en .env.
const ACCESS_COOKIE_NAME = "accessToken";
const REFRESH_COOKIE_NAME = "refreshToken";
const REFRESH_COOKIE_PATH = "/api/v1/auth/refresh";

const ACCESS_MAX_AGE_MS = 15 * 60 * 1000; // 15 min
const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

function baseOptions() {
    const isProd = process.env.NODE_ENV === "production";
    return {
        httpOnly: true,
        // En dev corremos sobre http (secure:true haría que el browser
        // descarte la cookie). En producción se espera HTTPS siempre.
        secure: isProd,
        sameSite: "lax",
    };
}

export function setAccessCookie(res, token) {
    res.cookie(ACCESS_COOKIE_NAME, token, {
        ...baseOptions(),
        path: "/",
        maxAge: ACCESS_MAX_AGE_MS,
    });
}

export function setRefreshCookie(res, token) {
    res.cookie(REFRESH_COOKIE_NAME, token, {
        ...baseOptions(),
        path: REFRESH_COOKIE_PATH,
        maxAge: REFRESH_MAX_AGE_MS,
    });
}

export function clearAuthCookies(res) {
    res.clearCookie(ACCESS_COOKIE_NAME, { ...baseOptions(), path: "/" });
    res.clearCookie(REFRESH_COOKIE_NAME, { ...baseOptions(), path: REFRESH_COOKIE_PATH });
}

export { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME };
