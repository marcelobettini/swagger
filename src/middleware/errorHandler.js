// Manejador de errores centralizado: es el único lugar que decide status + shape
// de una respuesta de error. Los route handlers no arman respuestas de error a mano,
// tiran un AppError (o dejan que Express 5 reenvíe acá cualquier rejection/excepción).
export function errorHandler(err, req, res, next) {
    let status = err.status || err.statusCode || 500;
    let message = err.message || "Internal Server Error";

    // CastError: Mongoose lo tira cuando el :id de la ruta no es un ObjectId válido
    // (findById/findByIdAndUpdate/findByIdAndDelete). Sin esto cae al 500 genérico,
    // pero es un error del cliente (id mal formado), no del servidor.
    if (err.name === "CastError") {
        status = 400;
        message = `Id inválido: ${err.value}`;
    }

    // ValidationError: falla una regla del schema (ej. priority fuera del enum)
    // al pasar por save()/create() en vez de por la validación manual de la ruta.
    if (err.name === "ValidationError") {
        status = 400;
        message = Object.values(err.errors).map((e) => e.message).join(", ");
    }

    // Los errores >= 500 son inesperados (bug o falla real): se loguean con stack.
    // Los 4xx son esperables (input inválido, recurso no encontrado) y quedan silenciosos.
    if (status >= 500) console.error(err.stack);

    res.status(status).json({ status, error: message });
}
