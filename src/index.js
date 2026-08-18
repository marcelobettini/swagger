// Entry point: Configuramos Express y arrancamos el server
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import tasksRouter from './routes/tasks.js';
import healthRouter from "./routes/health.js";
import { connectDB, disconnectDB } from './db/mongoClient.js';
import openapiSpec from './docs/openapi.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
// El .env ya no es obligatorio: con mongodb-memory-server no hace falta MONGO_URI,
// y PORT/DB_NAME tienen defaults. Si no existe el archivo, seguimos sin fallar.
try {
    process.loadEnvFile();
} catch {
    // no hay .env, seguimos con los defaults
}

// Red de seguridad a nivel de proceso: Express 5 ya reenvía al errorHandler cualquier
// excepción/rejection ocurrida dentro de un request, así que esto solo atrapa lo que
// pasa fuera de ese ciclo (código en top-level, un callback suelto, un timer, etc.).
// Un AppError ahí (err.isOperational) es un caso esperable: lo logueamos y el proceso
// sigue vivo. Cualquier otra cosa es un bug real — el estado del proceso puede haber
// quedado inconsistente, así que logueamos y salimos para que se reinicie limpio.
process.on("uncaughtException", (err) => {
    console.error("uncaughtException:", err);
    if (!err.isOperational) process.exit(1);
});
process.on("unhandledRejection", (reason) => {
    // Normalizamos: una rejection no manejada se trata igual que una excepción no capturada.
    throw reason instanceof Error ? reason : new Error(String(reason));
});
const app = express();
const PORT = process.env.PORT || 3001;
app.disable("x-powered-by");


// Parsear el body de las request como JSON
app.use(express.json());


const API_PREFIX = '/api/v1';

// Montamos el router de tareas bajo el prefijo /api/v1/tasks
app.use(`${API_PREFIX}/tasks`, tasksRouter);

// Spec JSON crudo (útil para clientes externos)
app.get(`${API_PREFIX}/openapi.json`, (req, res) => res.json(openapiSpec));

// Swagger UI en /api/v1 — montado después de /tasks para que Express resuelva primero la ruta más específica
app.use(API_PREFIX, swaggerUi.serve, swaggerUi.setup(openapiSpec));

app.use("/health", healthRouter);

// 404 para rutas no definidas, trabaja en conjunto con el error handler global
app.use(notFound);

// Manejador de errores centralizado (si le paso 4 params Express lo reconoce como
// error handler). Atrapa tanto los AppError que tiran las rutas como cualquier otra
// excepción/rejection: malformed JSON de express.json() (trae status: 400), CastError/
// ValidationError de Mongoose, o lo que sea inesperado (cae a 500).
app.use(errorHandler);

async function main() {
    await connectDB();
    app.listen(PORT, () => {
        console.log(`http://localhost:${PORT}`);
    });
}

// mongodb-memory-server levanta un proceso mongod real: hay que apagarlo explícitamente
// al cerrar, si no queda colgado en background.
async function shutdown() {
    await disconnectDB();
    process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch(err => {
    console.log('Error al iniciar el servidor:', err);
    process.exit(1);
}
);
