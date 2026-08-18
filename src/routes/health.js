import { Router } from "express";
import { getDB } from "../db/mongoClient.js";
const router = Router();

router.get('/', async (req, res) => {
    const timestamp = new Date().toISOString();
    try {
        await getDB().command({ ping: 1 });
        res.json({ status: 'ok', db: 'ok', timestamp });

    } catch (err) {
        console.log(err);
        // 503 Service Unavailable: el server corre pero la dependencia crítica no responde
        res.status(503).json({ status: 'error', db: 'unreachable', timestamp });
    }
});

export default router;