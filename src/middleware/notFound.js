import { AppError } from "../errors/AppError.js";

// Catch-all para rutas no definidas. Va montado después de todas las rutas reales
// y antes del errorHandler, que es quien efectivamente responde.
export function notFound(req, res, next) {
    next(new AppError(`Not Found: ${req.method} ${req.originalUrl}`, 404));
}
