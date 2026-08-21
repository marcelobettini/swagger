// Único lugar que arma las opciones de la cookie de sesión. login (vía
// authService) y logout (vía routes/auth.js) pasan por acá, así nunca se
// repiten ni se desincronizan las opciones entre donde se setea y donde se
// limpia (clearCookie necesita las mismas opciones exactas -sobre todo
// path- con las que se seteó, porque el browser matchea por nombre+path
// para saber cuál cookie borrar).
//
// secure/sameSite se calculan DENTRO de cada función, leyendo process.env
// en el momento de la llamada (no como const de módulo): igual que en
// src/db/mongoClient.js, los import se evalúan antes que el
// process.loadEnvFile() de src/index.js, así que una const de módulo
// ignoraría silenciosamente lo que haya en .env.
const ACCESS_COOKIE_NAME = "accessToken";

const ACCESS_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 horas

//Por qué usamos baseOptions() en lugar de un objeto literal: porque clearCookie necesita las mismas opciones exactas (sobre todo path) con las que se seteó, y si usamos un objeto literal en setAccessCookie y otro en clearAuthCookies, el browser no matchea y la cookie queda colgada. Por qué no machea: porque el browser matchea por nombre+path, y si en setAccessCookie usamos { path: "/" } y en clearAuthCookies usamos { path: "/api" }, el browser no sabe que son la misma cookie. Por eso usamos baseOptions() para que ambos usen exactamente las mismas opciones. Y por qué no escribir directamente los datos en setAccessCookie y clearAuthCookies: porque si en el futuro queremos cambiar alguna opción (por ejemplo, secure o sameSite), tendríamos que cambiarlo en dos lugares, y es fácil olvidarse de uno. Con baseOptions(), cambiamos en un solo lugar y ambos métodos se benefician.
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

export function clearAuthCookies(res) {
    res.clearCookie(ACCESS_COOKIE_NAME, {
        ...baseOptions(), path: "/"
    });
}

export { ACCESS_COOKIE_NAME };
