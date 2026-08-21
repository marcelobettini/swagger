import { Router } from "express";
import rateLimit from "express-rate-limit";
import { AppError } from "../errors/AppError.js";
import * as userService from "../services/userService.js";
import { issueSession } from "../services/authService.js";
import { clearAuthCookies } from "../utils/cookies.js";

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

// Rate limit simple contra fuerza bruta: 10 intentos cada 15 min por IP,
// solo en register/login (no en logout).
const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 429, error: "Demasiados intentos, probá de nuevo más tarde" },
});

// POST /api/auth/register — no inicia sesión automáticamente, el
// cliente tiene que llamar a /login por separado.
router.post("/register", authRateLimit, async (req, res) => {
    const firstName = req.body.firstName?.trim();
    const lastName = req.body.lastName?.trim();
    const email = req.body.email?.trim().toLowerCase();
    const { password } = req.body;

    if (!firstName) throw new AppError("El campo firstName es obligatorio", 400);
    if (!lastName) throw new AppError("El campo lastName es obligatorio", 400);
    if (!email || !EMAIL_RE.test(email)) throw new AppError("El campo email es inválido", 400);
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
        throw new AppError(`El campo password debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`, 400);
    }

    // Un email duplicado tira un error de Mongo (code 11000) que
    // errorHandler.js traduce a 409 -no hace falta chequearlo acá a mano.
    const user = await userService.createUser({ firstName, lastName, email, password });
    res.status(201).json(user);
});

// POST /api/auth/login
router.post("/login", authRateLimit, async (req, res) => {
    const email = req.body.email?.trim().toLowerCase();
    const { password } = req.body;
    if (!email || !password) throw new AppError("email y password son obligatorios", 400);

    // Mensaje genérico en ambos casos: no le damos a un atacante forma de
    // distinguir "el email no existe" de "la password es incorrecta".
    const user = await userService.findByEmailWithPassword(email);
    if (!user || !(await userService.verifyPassword(password, user.passwordHash))) {
        throw new AppError("Credenciales inválidas", 401);
    }

    await issueSession(user, res);
    res.json(user);
});

// POST /api/auth/logout — best-effort, sin requireAuth: si el access
// token ya expiró, un requireAuth estricto dejaría la cookie "colgada" sin
// forma de limpiarla desde el cliente. No hay nada que revocar en DB (JWT
// stateless, sin refresh token) -logout es puramente limpiar la cookie.
router.post("/logout", (req, res) => {
    clearAuthCookies(res);
    res.json({ status: "ok" });
});

export default router;
