// Entry point: Configuramos Express y arrancamos el server
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import authRouter from './routes/auth.js';
import tasksRouter from './routes/tasks.js';
import healthRouter from "./routes/health.js";
import { connectDB, disconnectDB } from './db/mongoClient.js';
import openapiSpec from './docs/openapi.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import { attachUser } from './middleware/auth.js';
// El .env ya no es obligatorio: con mongodb-memory-server no hace falta MONGO_URI,
// y PORT/DB_NAME tienen defaults. Si no existe el archivo, seguimos sin fallar.
try {
    process.loadEnvFile();
} catch {
    // no hay .env, seguimos con los defaults
}

// En dev, authService.js arranca igual sin JWT_ACCESS_SECRET (usa un
// fallback inseguro y loguea un warning) para no romper el "cero config" de
// npm run dev. En producción ese secret es obligatorio: si falta, no tiene
// sentido servir tráfico real firmando tokens con un secreto hardcodeado y
// público -mejor no arrancar.
function assertProductionSecrets() {
    if (process.env.NODE_ENV !== "production") return;
    if (!process.env.JWT_ACCESS_SECRET) {
        throw new Error("Falta la variable de entorno obligatoria en producción: JWT_ACCESS_SECRET");
    }
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


// CORS: sin CORS_ORIGIN seteado no habilitamos ningún origin (no usamos
// "*" porque las cookies de sesión requieren credentials:true, y los
// browsers rechazan credentials:true combinado con origin "*"). Pensado
// para un frontend futuro que todavía no existe en este repo.
const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors({ origin: corsOrigin || false, credentials: true }));

// Cookies antes que las rutas: authService/attachUser necesitan leer la
// cookie accessToken.
app.use(cookieParser());

// Parsear el body de las request como JSON
app.use(express.json());

const API_PREFIX = '/api';

// attachUser corre para todo /api/* (auth + tasks + docs) pero no para
// /health: nunca tira, solo intenta resolver req.user a partir de la
// cookie accessToken -sin ningún tipo de renovación. Las rutas que
// necesitan bloquear a un usuario no autenticado usan requireAuth aparte.
app.use(API_PREFIX, attachUser);

// Montamos el router de auth bajo el prefijo /api/auth
app.use(`${API_PREFIX}/auth`, authRouter);

// Montamos el router de tareas bajo el prefijo /api/tasks
app.use(`${API_PREFIX}/tasks`, tasksRouter);

// Spec JSON crudo (útil para clientes externos)
app.get(`${API_PREFIX}/openapi.json`, (req, res) => res.json(openapiSpec));

// Swagger UI en /api — montado después de /tasks para que Express resuelva primero la ruta más específica
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
    assertProductionSecrets();
    await connectDB();
    app.listen(PORT, () => {
        console.log(`http://localhost:${PORT}`);
    });
}

// mongodb-memory-server levanta un proceso mongod real: hay que apagarlo explícitamente
// al cerrar, si no queda colgado en background.
async function shutdown() {
    await disconnectDB();
    console.log("\n\n Cerrando Base de datos...\n\n");
    process.exit(0);
}
//
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch(err => {
    console.log('Error al iniciar el servidor:', err);
    process.exit(1);
}
);
