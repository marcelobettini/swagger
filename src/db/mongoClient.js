// Módulo de conexión a MongoDB usando Mongoose + mongodb-memory-server.
// Ya no dependemos de MongoDB Atlas: mongodb-memory-server levanta un mongod real
// en memoria en cada arranque, y Mongoose se conecta a esa instancia efímera.
// Singleton -> connectDB() se llama una sola vez al arrancar el servidor,
// antes del app.listen().
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

const DB_NAME = process.env.DB_NAME || "tododb";

// Referencia al proceso mongod en memoria, para poder detenerlo en disconnectDB()
let mongod;

export async function connectDB() {
    mongod = await MongoMemoryServer.create({ instance: { dbName: DB_NAME } });
    const uri = mongod.getUri();
    await mongoose.connect(uri, { dbName: DB_NAME });
    console.log(`Conectado a MongoDB en memoria (mongodb-memory-server) - base de datos: ${DB_NAME}`);
}

// Devuelve el objeto Db nativo subyacente (Mongoose lo expone en connection.db).
// Lo sigue usando el health check para hacer el ping.
export function getDB() {
    if (mongoose.connection.readyState !== 1) throw new Error("DB no inicializada. Debes correr connectDB() antes.");
    return mongoose.connection.db;
}

// Cierra la conexión de Mongoose y apaga el mongod en memoria. Útil para un shutdown
// prolijo y para tests (mongodb-memory-server no libera el proceso solo).
export async function disconnectDB() {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
}
