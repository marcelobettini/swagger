import { AppError } from "../errors/AppError.js";

// Catch-all para rutas no definidas. Va montado después de todas las rutas reales
// y antes del errorHandler, que es quien efectivamente responde. Tira el AppError
// en vez de pasarlo a mano por next(err): Express 5 reenvía automáticamente
// cualquier throw síncrono al errorHandler, mismo patrón que usan las rutas.
export function notFound(req, res) {
    throw new AppError(`Not Found: ${req.method} ${req.originalUrl}`, 404);
}
