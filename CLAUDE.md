# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start dev server (requires .env file)
npm run dev
# Equivalent: node --watch --env-file=.env src/index.js
```

No test runner is configured (`npm test` exits with an error).

## Environment

No `.env` file is required to run the app — `mongodb-memory-server` spins up an
ephemeral, in-memory `mongod` on every start, so there's no external database to
configure. An optional `.env` file can still override defaults:
```
PORT=3001
DB_NAME=<database name>
```

## Architecture

Express 5 REST API using ES Modules (`"type": "module"`). API is versioned under `/api/v1`.

**Data layer**
- `src/models/Task.js` — Mongoose schema/model for the `tasks` collection. Uses the schema's `timestamps: true` option, so `createdAt`/`updatedAt` are managed entirely by Mongoose (set on `create()`, refreshed on every update — including `toggle`'s aggregation-pipeline update) rather than by route/service code. Defines a `toJSON` transform that renames `_id` to `id` and drops `_id` — no manual reshaping needed elsewhere.
- `src/services/taskService.js` — CRUD service built on the `Task` model. All functions are async and return hydrated Mongoose documents (not `.lean()`) so the model's `toJSON` transform runs when Express serializes the response. `toggle` uses an aggregation pipeline update for an atomic flip of `completed`.
- `src/db/mongoClient.js` — Singleton connection (connect once at startup, expose `getDB()`/`disconnectDB()`). Starts an in-memory `mongod` via `mongodb-memory-server` and connects Mongoose to it — no MongoDB Atlas / external URI involved. `getDB()` exposes the underlying native `Db` object (`mongoose.connection.db`), used by the health check. `disconnectDB()` closes the Mongoose connection and stops the in-memory `mongod`; called on `SIGINT`/`SIGTERM` in `src/index.js` so no orphan `mongod` process is left running.
- `src/services/fileStore.js` — legacy JSON file store, no longer wired up.
- `src/docs/openapi.js` — OpenAPI 3.0 spec (central object). Consumed by `swagger-ui-express` to render the interactive docs at `/api/v1` and exposed as raw JSON at `/api/v1/openapi.json`.

**Request flow**
```
src/index.js  →  /api/v1/tasks       →  src/routes/tasks.js  →  src/services/taskService.js  →  MongoDB
               →  /api/v1            →  swagger-ui-express   →  src/docs/openapi.js
               →  /api/v1/openapi.json → src/docs/openapi.js
               →  /health            →  src/routes/health.js  →  src/db/mongoClient.js        →  MongoDB
```

**Task schema**: `{ id (ObjectId string), title, description, priority ("low"|"mid"|"high"), completed (bool), createdAt, updatedAt }`

**Input handling**
- `title` and `description` are trimmed at the route layer before validation. A whitespace-only `title` is rejected with 400.

**Error handling**
- `src/errors/AppError.js` — small operational-error class (`message`, `status`, `isOperational: true`). Route handlers `throw new AppError(msg, status)` for expected failures (validation, not found) instead of building `res.status().json()` responses by hand; Express 5 forwards both thrown errors and rejected promises from async handlers to the centralized error handler automatically.
- `src/middleware/notFound.js` — catch-all mounted after all routes; turns any unmatched route into a 404 `AppError`.
- `src/middleware/errorHandler.js` — the single place that turns an error into a response. Translates Mongoose `CastError` (malformed ObjectId) and `ValidationError` into 400s; everything else falls back to `err.status || err.statusCode || 500` (`statusCode` is checked too since some third-party middleware — e.g. `express.json()`'s malformed-JSON `SyntaxError` — uses that property instead of `status`). Every error response has the same shape: `{ status, error }`. Stack traces are only logged to console for 5xx errors; 4xx errors (malformed JSON, not found, validation) are silent in the console.
- `src/index.js` also registers process-level `uncaughtException`/`unhandledRejection` handlers as a safety net for errors outside Express's request cycle (Express 5 already routes in-request errors to `errorHandler`). This is `isOperational`'s only consumer: an `AppError` reaching there is logged and the process keeps running; anything else is treated as a bug with possibly-corrupted process state, so it's logged and the process exits (`process.exit(1)`) to be restarted clean.
