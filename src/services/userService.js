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
