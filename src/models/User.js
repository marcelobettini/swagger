// Modelo Mongoose de un usuario. Sigue el mismo patrón que Task.js: toJSON
// renombra _id -> id. Acá además borramos a mano el password hasheado en el
// transform, como defensa en profundidad: aunque tenga select:false, un
// .select('+passwordHash') explícito (necesario para login) lo reincorpora
// al documento en memoria, y no queremos que un JSON.stringify accidental
// lo filtre.
//
// No hay ningún campo de sesión acá (ni refresh token, ni nada): la sesión
// es un JWT stateless de 12h (ver src/services/authService.js), así que no
// hay nada que persistir ni que revocar del lado servidor -logout es
// puramente client-side (limpiar la cookie).
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
    {
        firstName: { type: String, required: true, trim: true },
        lastName: { type: String, required: true, trim: true },
        //lowercase: true -> 
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        // "user" por default: la única forma de volverse admin es el seed de
        // arranque (ver ensureAdminUser en userService.js) -createUser no
        // acepta este campo, así que no se puede auto-promover vía /register.
        role: { type: String, enum: ["user", "admin"], default: "user" },
        // select:false: no viaja en queries normales (find/findById), hay que
        // pedirlo explícitamente con .select('+passwordHash') para login.
        passwordHash: { type: String, required: true, select: false },
    },
    {
        timestamps: true,
        versionKey: false,
        toJSON: {
            transform: (_doc, ret) => {
                ret.id = ret._id.toString();
                delete ret._id;
                delete ret.passwordHash;
                return ret;
            },
        },
    }
);
//si se omite el 3er parámetro, mongoose infiere el nombre de la colección a partir del nombre del modelo (User -> users). Acá lo ponemos explícito para que quede claro.
export default mongoose.model("User", userSchema, "users");
