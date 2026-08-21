// Modelo Mongoose de una tarea.
// A diferencia del driver nativo, Mongoose sí tiene una capa de transformación (toJSON)
// que nos permite renombrar _id -> id automáticamente en cada respuesta.
import mongoose from "mongoose";

const taskSchema = new mongoose.Schema(
    {
        title: { type: String, required: true },
        description: { type: String, default: "" },
        priority: { type: String, enum: ["low", "mid", "high"], default: "low" },
        completed: { type: Boolean, default: false },
        // Dueño de la tarea: solo este usuario puede editarla/borrarla (ver
        // src/routes/tasks.js). Mongo serializa el ObjectId como string hex
        // automáticamente, no hace falta tocar el toJSON transform de abajo.
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    },
    {
        // Mongoose gestiona createdAt/updatedAt solo: los setea en create() y los actualiza
        // en cada findByIdAndUpdate/update pipeline, incluso en el flip atómico de toggle().
        timestamps: true,
        versionKey: false,
        toJSON: {
            transform: (_doc, ret) => {
                ret.id = ret._id.toString();
                delete ret._id;
                return ret;
            },
        },
    }
);

export default mongoose.model("Task", taskSchema, "tasks");
