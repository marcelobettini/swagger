// Servicio de persistencia/credenciales de usuario. No sabe nada de JWT
// ni de cookies -esa orquestación vive en authService.js-, solo hashea
// passwords y lee/escribe el documento User. Sin refresh token, no hay
// ningún estado de sesión que persistir acá: solo credenciales.
import bcrypt from "bcryptjs";
import User from "../models/User.js";

const SALT_ROUNDS = 10;

export async function createUser({ firstName, lastName, email, password }) {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    // Un email duplicado tira un error nativo de Mongo (code 11000, por el
    // índice unique) que errorHandler.js traduce a 409 -no lo chequeamos acá
    // a mano para evitar una race condition entre el findOne y el create.
    return User.create({ firstName, lastName, email, passwordHash });
}

// findByEmailWithPassword: busca un usuario por su email y devuelve el
// documento con el campo passwordHash incluido, que normalmente está
// excluido de la selección por defecto. Usado durante el login para
// verificar la contraseña.
export async function findByEmailWithPassword(email) {
    return User.findOne({ email }).select("+passwordHash");
}

export async function verifyPassword(plain, hash) {
    return bcrypt.compare(plain, hash);
}

// seeder 02. Recibe las credenciales ya resueltas por seeder 01
// (/src/index.js) y hace la escritura idempotente: crea o promueve el User
// a role:"admin", sin saber nada de process.env ni de si es prod o dev
// -mismo principio que separa authService.js (JWT) de la DB: cada capa
// conoce una sola cosa. Así queda reusable (cualquier caller con un
// email/password puede sembrar un admin, no solo el arranque) y fácil de
// probar sin tocar variables globales. createUser() a propósito no acepta
// `role`: esta es la única función que puede escribir role:"admin", y solo
// seeder 01 la llama -así ningún endpoint (ej. /auth/register) puede
// auto-promover a un usuario.
export async function ensureAdminUser({ firstName, lastName, email, password }) {
    const existing = await User.findOne({ email });
    if (existing) {
        if (existing.role !== "admin") {
            existing.role = "admin";
            await existing.save();
        }
        return existing;
    }
    const user = await createUser({ firstName, lastName, email, password });
    user.role = "admin";
    await user.save();
    return user;
}
