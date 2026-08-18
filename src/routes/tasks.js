import { Router } from "express";
import { getAll, getById, add, update, remove, toggle } from "../services/taskService.js";
import { AppError } from "../errors/AppError.js";

const router = Router();
const VALID_PRIORITIES = ["low", "mid", "high"];

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
router.post("/", async (req, res) => {
    const title = req.body.title?.trim();
    const description = (req.body.description ?? "").trim();
    const { priority = "low" } = req.body;
    if (!title) throw new AppError("El campo title es obligatorio", 400);
    if (!VALID_PRIORITIES.includes(priority)) {
        throw new AppError(`El campo priority debe ser uno de: ${VALID_PRIORITIES.join(", ")}`, 400);
    }
    // createdAt/updatedAt los setea Mongoose solo (schema con timestamps: true)
    const task = await add({ title, description, priority, completed: false });
    res.status(201).json(task);
});

// PATCH /api/v1/tasks/:id/toggle — before /:id so Express doesn't treat "toggle" as an id
router.patch("/:id/toggle", async (req, res) => {
    const task = await toggle(req.params.id);
    if (!task) throw new AppError(`No se encontró la tarea con id ${req.params.id}`, 404);
    res.json(task);
});

// PATCH /api/v1/tasks/:id
router.patch("/:id", async (req, res) => {
    const { id } = req.params;
    const task = await getById(id);
    if (!task) throw new AppError(`No se encontró la tarea con id ${id}`, 404);

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
router.delete("/:id", async (req, res) => {
    const removed = await remove(req.params.id);
    if (!removed) throw new AppError(`No se encontró la tarea con id ${req.params.id}`, 404);
    res.status(204).send();
});

export default router;
