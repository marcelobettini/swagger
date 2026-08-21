import Task from "../models/Task.js";



export async function getAll({ completed, search } = {}) {
    const query = {};
    if (completed !== undefined) query.completed = completed;
    if (search) {
        // Escapamos caracteres especiales de RegExp para que la búsqueda sea literal, cubre casos como "C++" o "Node.js". La búsqueda es case-insensitive.
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        // const re = new RegExp(search, "i"); // búsqueda case-insensitive sin escapar caracteres especiales
        const re = new RegExp(escaped, "i");
        // Buscamos en title o description, usando $or. Mongoose traduce esto a un $or de MongoDB.
        query.$or = [{ title: re }, { description: re }];
    }
    return Task.find(query);
}

// Solo para el listado de admin: trae el creador de cada tarea con populate.
// El resto de los endpoints sigue devolviendo userId como string, sin joins.
export async function getAllWithUsers() {
    return Task.find().populate("userId", "firstName lastName email");
}

export async function getById(id) {
    return Task.findById(id);
}

export async function add(fields) {
    return Task.create(fields);
}

export async function update(id, fields) {
    return Task.findByIdAndUpdate(id, { $set: fields }, { returnDocument: "after" }); // Devuelve el documento actualizado, no el original    
}

export async function remove(id) {
    const deleted = await Task.findByIdAndDelete(id);
    return deleted !== null;
}

export async function toggle(id) {
    // Usamos un pipeline de actualización con $set y $not para invertir el valor de completed. Esto evita tener que hacer un findById + update en dos pasos, y es atómico. Atómico = si dos requests concurrentes intentan hacer toggle al mismo tiempo, MongoDB garantiza que el valor final será consistente (uno de los toggles se aplicará después del otro). Si hiciéramos findById + update en dos pasos, podrían leerse valores intermedios y perderse un toggle. Transacciones de MongoDB también podrían usarse, pero son más pesadas y no necesarias para este caso simple. 
    // ACID: 
    // 1- Atomicidad 
    // 2- Consistencia 
    // 3- Aislamiento 
    // 4- Durabilidad. 
    // En este caso nos interesa la atomicidad: la operación de toggle se aplica como un todo o no se aplica. "Como un todo" = si falla la operación, no se aplica ningún cambio. "No se aplica ningún cambio" = si falla el toggle, el valor de completed sigue siendo el mismo que antes del toggle. Esto evita inconsistencias en la base de datos.

    return Task.findByIdAndUpdate(
        id,
        [{ $set: { completed: { $not: ["$completed"] } } }],
        { returnDocument: "after" } // Devuelve el documento actualizado, no el original
    );
}
