// Modelo Mongoose de un usuario. Sigue el mismo patrón que Task.js: toJSON
// renombra _id -> id. Acá además borramos a mano los campos sensibles
// (password hasheado y estado de refresh token) en el transform, como
// defensa en profundidad: aunque tengan select:false, un .select('+passwordHash')
// explícito (necesario para login/refresh) los reincorpora al documento en
// memoria, y no queremos que un JSON.stringify accidental los filtre.
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
    {
        firstName: { type: String, required: true, trim: true },
        lastName: { type: String, required: true, trim: true },
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        // select:false: no viaja en queries normales (find/findById), hay que
        // pedirlo explícitamente con .select('+passwordHash') para login/refresh.
        passwordHash: { type: String, required: true, select: false },
        // Estado de la sesión activa (una sola por usuario, ver CLAUDE.md).
        // hash SHA-256 del refresh token JWT vigente; null si no hay sesión
        // (nunca logueado, o logout).
        refreshTokenHash: { type: String, default: null, select: false },
        refreshTokenExpiresAt: { type: Date, default: null, select: false },
    },
    {
        timestamps: true,
        versionKey: false,
        toJSON: {
            transform: (_doc, ret) => {
                ret.id = ret._id.toString();
                delete ret._id;
                delete ret.passwordHash;
                delete ret.refreshTokenHash;
                delete ret.refreshTokenExpiresAt;
                return ret;
            },
        },
    }
);

export default mongoose.model("User", userSchema, "users");
