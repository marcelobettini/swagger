import { Router } from "express";
import { getAll, getById, add, update, remove, toggle } from "../services/taskService.js";
import { AppError } from "../errors/AppError.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const VALID_PRIORITIES = ["low", "mid", "high"];

// Solo el usuario que creó la tarea puede editarla/borrarla. Las tareas son
// públicamente visibles igual (GET no requiere auth), así que no tiene
// sentido devolver 404 para ocultar su existencia -devolvemos 403.
function assertOwner(task, userId) {
    if (task.userId.toString() !== userId) {
        throw new AppError("No tenés permiso para modificar esta tarea", 403);
    }
}

// GET /api/v1/tasks
router.get("/", async (req, res) => {
    const { completed, search } = req.query;
    const filters = {};
    if (completed !== undefined) filters.completed = completed === "true";
    if (search) filters.search = search;

    const tasks = await getAll(filters);
    if (!tasks.length) {
        throw new AppError("No se encontraron tareas", 404);
    }
    res.json(tasks);
});

// GET /api/v1/tasks/:id
router.get("/:id", async (req, res) => {
    const task = await getById(req.params.id);
    if (!task) throw new AppError(`No se encontró la tarea con id ${req.params.id}`, 404);
    res.json(task);
});

// POST /api/v1/tasks
router.post("/", requireAuth, async (req, res) => {
    const title = req.body.title?.trim();
    const description = (req.body.description ?? "").trim();
    const { priority = "low" } = req.body;
    if (!title) throw new AppError("El campo title es obligatorio", 400);
    if (!VALID_PRIORITIES.includes(priority)) {
        throw new AppError(`El campo priority debe ser uno de: ${VALID_PRIORITIES.join(", ")}`, 400);
    }
    // createdAt/updatedAt los setea Mongoose solo (schema con timestamps: true)
    const task = await add({ title, description, priority, completed: false, userId: req.user.id });
    res.status(201).json(task);
});

// PATCH /api/v1/tasks/:id/toggle — before /:id so Express doesn't treat "toggle" as an id
router.patch("/:id/toggle", requireAuth, async (req, res) => {
    const { id } = req.params;
    const existing = await getById(id);
    if (!existing) throw new AppError(`No se encontró la tarea con id ${id}`, 404);
    assertOwner(existing, req.user.id);

    const task = await toggle(id);
    res.json(task);
});

// PATCH /api/v1/tasks/:id
router.patch("/:id", requireAuth, async (req, res) => {
    const { id } = req.params;
    const task = await getById(id);
    if (!task) throw new AppError(`No se encontró la tarea con id ${id}`, 404);
    assertOwner(task, req.user.id);

    const title = req.body.title?.trim();
    const description = req.body.description?.trim();
    const { priority, completed } = req.body;
    if (priority !== undefined && !VALID_PRIORITIES.includes(priority)) {
        throw new AppError(`El campo priority debe ser uno de: ${VALID_PRIORITIES.join(", ")}`, 400);
    }
    const fields = {};
    if (title !== undefined) fields.title = title;
    if (description !== undefined) fields.description = description;
    if (priority !== undefined) fields.priority = priority;
    if (completed !== undefined) fields.completed = completed;
    // updatedAt lo actualiza Mongoose solo (schema con timestamps: true)

    const updated = await update(id, fields);
    res.json(updated);
});

// DELETE /api/v1/tasks/:id
router.delete("/:id", requireAuth, async (req, res) => {
    const { id } = req.params;
    const existing = await getById(id);
    if (!existing) throw new AppError(`No se encontró la tarea con id ${id}`, 404);
    assertOwner(existing, req.user.id);

    await remove(id);
    res.status(204).send();
});

export default router;
