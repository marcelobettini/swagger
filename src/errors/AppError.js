// Error "operacional": un caso esperable (validación, recurso no encontrado, etc.)
// que un route handler puede lanzar y que el manejador de errores centralizado sabe
// traducir directamente a una respuesta HTTP, sin loguear stack trace.
//
// isOperational: true distingue esto de un bug/error de programación. La idea (patrón
// clásico de Node: guía de error handling de Joyent, popularizado también por libros
// como "Node.js Design Patterns") es que un error operacional es parte del funcionamiento
// normal de la app -> se puede loguear y seguir corriendo tranquilo. Un error NO
// operacional (un bug real: TypeError, referencia a algo undefined, estado corrupto, etc.)
// significa que no sabemos en qué estado quedó el proceso, así que lo más seguro es
// loguearlo y matar el proceso para que arranque de nuevo limpio, en vez de seguir
// sirviendo requests sobre un estado potencialmente roto.
//
// El único consumidor de esta bandera son los handlers de proceso en src/index.js
// (process.on("uncaughtException"/"unhandledRejection")): si err.isOperational es true,
// loguean y siguen; si no, hacen process.exit(1).
//
// Importante: como Express 5 atrapa automáticamente lo que se tira/rechaza *dentro* de
// un route handler y lo manda al errorHandler (src/middleware/errorHandler.js), un
// AppError normal (POST /tasks sin title, GET /tasks/:id con id trucho, etc.) NUNCA
// llega hasta esos handlers de proceso — se resuelve ahí mismo como una respuesta 4xx.
// Esos handlers son una red de seguridad para lo que queda FUERA del ciclo de un
// request, por ejemplo:
//   - Un error durante el arranque (connectDB() en src/db/mongoClient.js) si en algún
//     momento se lanza sin pasar por el .catch() de main().
//   - Una promesa lanzada "y olvidada" en background (un timer, un job programado) que
//     nadie awaitea ni encadena con .catch().
//   - Un error síncrono en código top-level fuera de un handler de Express.
// En esos casos, si alguna vez se lanza un AppError a propósito (por ejemplo, código
// futuro que valide algo fuera de una ruta), el proceso sigue vivo en lugar de reiniciar.
export class AppError extends Error {
    constructor(message, status = 500) {
        super(message);
        this.status = status;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}
