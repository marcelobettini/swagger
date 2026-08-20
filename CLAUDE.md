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
configure. An optional `.env` file can still override defaults (see `.env.example`):
```
PORT=3001
DB_NAME=<database name>
NODE_ENV=development|production
JWT_ACCESS_SECRET=<secret>
JWT_REFRESH_SECRET=<secret>
CORS_ORIGIN=<frontend origin, e.g. http://localhost:5173>
```
`JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` are optional in dev only: if unset,
`src/services/authService.js` falls back to a hardcoded insecure secret and
logs a warning, so `npm run dev` keeps working with zero config. In
`NODE_ENV=production`, both are required — `src/index.js` refuses to start
(`assertProductionSecrets()`, called from `main()`) if either is missing.
`CORS_ORIGIN` is unset by default, which disables CORS entirely (no `*`
fallback, since cookie-based auth needs `credentials: true`, which browsers
reject when combined with a wildcard origin).

## Architecture

Express 5 REST API using ES Modules (`"type": "module"`). API is versioned under `/api/v1`.

**Data layer**
- `src/models/Task.js` — Mongoose schema/model for the `tasks` collection. Uses the schema's `timestamps: true` option, so `createdAt`/`updatedAt` are managed entirely by Mongoose (set on `create()`, refreshed on every update — including `toggle`'s aggregation-pipeline update) rather than by route/service code. Defines a `toJSON` transform that renames `_id` to `id` and drops `_id` — no manual reshaping needed elsewhere. `userId` (required, `ref: 'User'`) records the creator; serialized as a plain hex string by Mongo's default `ObjectId`→JSON conversion, no populate.
- `src/models/User.js` — Mongoose schema/model for the `users` collection. `email` has a `unique` index (duplicate registration surfaces as a Mongo `code: 11000` error, translated to 409 by `errorHandler.js`). `passwordHash`/`refreshTokenHash`/`refreshTokenExpiresAt` are `select: false` (excluded from normal queries) and also stripped explicitly in the `toJSON` transform as defense in depth, since `userService.js` does `.select('+passwordHash')`/`.select('+refreshTokenHash …')` for login/refresh, which reintroduces them onto the in-memory document.
- `src/services/taskService.js` — CRUD service built on the `Task` model. All functions are async and return hydrated Mongoose documents (not `.lean()`) so the model's `toJSON` transform runs when Express serializes the response. `toggle` uses an aggregation pipeline update for an atomic flip of `completed`. Ownership checks are **not** done here — routes fetch with `getById` first and compare `task.userId` before calling `update`/`remove`/`toggle`, same pattern already used for 404s.
- `src/services/userService.js` — user persistence/credentials only (hashing with `bcryptjs`, `email` uniqueness via the schema index). Knows nothing about JWTs or cookies.
- `src/services/authService.js` — JWT issuance/verification and session orchestration (calls into `userService` to persist refresh-token state, never touches `User` directly). Access/refresh token TTLs (15 min / 7 days) are hardcoded constants here rather than env vars — see the comment in the file for why (they must stay in sync with the cookie `maxAge` values in `src/utils/cookies.js`, and aren't the kind of value that varies per deployment environment). Also owns the dev-only insecure-secret fallback (see Environment above).
- `src/utils/cookies.js` — single place that defines cookie options for `accessToken`/`refreshToken` (`httpOnly`, `secure` gated on `NODE_ENV==='production'`, `sameSite: 'lax'`, distinct `path`s and `maxAge`s). Both the code that sets and the code that clears these cookies goes through here, since `clearCookie` needs matching options (especially `path`) to actually remove a cookie the browser holds.
- `src/db/mongoClient.js` — Singleton connection (connect once at startup, expose `getDB()`/`disconnectDB()`). Starts an in-memory `mongod` via `mongodb-memory-server` and connects Mongoose to it — no MongoDB Atlas / external URI involved. `getDB()` exposes the underlying native `Db` object (`mongoose.connection.db`), used by the health check. `disconnectDB()` closes the Mongoose connection and stops the in-memory `mongod`; called on `SIGINT`/`SIGTERM` in `src/index.js` so no orphan `mongod` process is left running.
- `src/services/fileStore.js` — legacy JSON file store, no longer wired up.
- `src/docs/openapi.js` — OpenAPI 3.0 spec (central object). Consumed by `swagger-ui-express` to render the interactive docs at `/api/v1` and exposed as raw JSON at `/api/v1/openapi.json`.

**Auth**
- Registration (`POST /api/v1/auth/register`) takes `firstName`/`lastName`/`email`/`password` (min 8 chars), hashes the password with `bcryptjs`, and does **not** start a session — the client calls `/auth/login` separately.
- Login (`POST /api/v1/auth/login`) verifies credentials with a generic "Credenciales inválidas" message (doesn't reveal whether the email exists) and, on success, calls `authService.issueSession`: signs a short-lived access token and a refresh token, hashes the refresh token (SHA-256, not bcrypt — bcrypt silently truncates inputs over 72 bytes, which a JWT exceeds) and stores that hash + expiry on the `User` document, then sets both cookies.
- Every request under `/api/v1/*` (except `/health`) passes through `attachUser` (`src/middleware/auth.js`), mounted globally in `src/index.js`. It never throws: it verifies the `accessToken` cookie; if that's missing/expired, it attempts a **silent refresh** using the `refreshToken` cookie (`authService.rotateSession`) — on success it rotates both tokens (new access + new refresh, old refresh hash overwritten in DB) and rewrites the cookies transparently; on failure it clears both cookies and leaves `req.user = null`. Routes that must reject anonymous requests add `requireAuth` (throws `AppError(…, 401)` if `req.user` is null).
- **Single active session per user**: the refresh-token hash lives directly on the `User` document (no separate `Session`/`RefreshToken` collection), so logging in on a second device invalidates the first session's refresh token on its next rotation. This is an explicit, accepted simplification — no multi-device session support was requested.
- **Refresh-token reuse**: if a presented refresh token doesn't match the hash stored on `User`, that single request is treated as non-renewable (401 on protected routes) but the active session is **not** revoked — this avoids self-inflicted logouts from benign races (e.g. two near-simultaneous requests from two tabs, where the second still holds a refresh token the first already rotated).
- Logout (`POST /api/v1/auth/logout`) is intentionally **not** gated by `requireAuth`: the `refreshToken` cookie's `path=/api/v1/auth/refresh` means it never reaches `/auth/logout` in the first place, and requiring a still-valid access token would leave cookies stuck client-side if it had already expired. It revokes the DB-side session when `req.user` is resolvable and always clears both cookies, responding 200 either way.
- Task authorization: `POST /api/v1/tasks` requires `requireAuth` and stamps `userId` from `req.user`. `PATCH /api/v1/tasks/:id[/toggle]` and `DELETE /api/v1/tasks/:id` require `requireAuth` *and* ownership (`task.userId === req.user.id`, checked in the route via a local `assertOwner` helper) — a non-owner gets `403`, not `404`, since tasks are publicly readable anyway so there's nothing to hide. `GET` routes stay fully public.
- CORS (`cors` package, in `src/index.js`) is configured with `credentials: true` and `origin` bound to `CORS_ORIGIN` (or `false` if unset) — no `*`, which browsers reject alongside `credentials: true`.

**Request flow**
```
src/index.js  →  /api/v1/auth        →  src/routes/auth.js   →  src/services/authService.js / userService.js → MongoDB
               →  /api/v1/tasks       →  src/routes/tasks.js  →  src/services/taskService.js  →  MongoDB
               →  /api/v1            →  swagger-ui-express   →  src/docs/openapi.js
               →  /api/v1/openapi.json → src/docs/openapi.js
               →  /health            →  src/routes/health.js  →  src/db/mongoClient.js        →  MongoDB
```
`attachUser` (`src/middleware/auth.js`) sits in front of every `/api/v1/*` route (mounted before both `auth` and `tasks` routers) and resolves/refreshes `req.user` before any router-specific logic runs.

**Task schema**: `{ id (ObjectId string), title, description, priority ("low"|"mid"|"high"), completed (bool), userId (ObjectId string, creator), createdAt, updatedAt }`

**User schema**: `{ id (ObjectId string), firstName, lastName, email, createdAt, updatedAt }` (`passwordHash`/refresh-token fields never serialize, see `src/models/User.js`).

**Input handling**
- `title` and `description` are trimmed at the route layer before validation. A whitespace-only `title` is rejected with 400.
- `firstName`/`lastName`/`email` are trimmed at the route layer in `src/routes/auth.js`; `email` is additionally lowercased and checked against a basic format regex. `password` must be at least 8 characters.
- `POST /api/v1/auth/register` and `POST /api/v1/auth/login` are rate-limited (`express-rate-limit`, 10 requests / 15 min per IP) to blunt brute-force attempts; `/auth/refresh` and `/auth/logout` are not.

**Error handling**
- `src/errors/AppError.js` — small operational-error class (`message`, `status`, `isOperational: true`). Route handlers `throw new AppError(msg, status)` for expected failures (validation, not found) instead of building `res.status().json()` responses by hand; Express 5 forwards both thrown errors and rejected promises from async handlers to the centralized error handler automatically.
- `src/middleware/notFound.js` — catch-all mounted after all routes; turns any unmatched route into a 404 `AppError`.
- `src/middleware/errorHandler.js` — the single place that turns an error into a response. Translates Mongoose `CastError` (malformed ObjectId) and `ValidationError` into 400s, and a Mongo duplicate-key error (`err.code === 11000`, e.g. registering an already-used email) into 409; everything else falls back to `err.status || err.statusCode || 500` (`statusCode` is checked too since some third-party middleware — e.g. `express.json()`'s malformed-JSON `SyntaxError` — uses that property instead of `status`). Every error response has the same shape: `{ status, error }`. Stack traces are only logged to console for 5xx errors; 4xx errors (malformed JSON, not found, validation) are silent in the console. `jsonwebtoken` errors never reach this handler directly — `authService.safeVerify` catches them internally so `attachUser` can honor its "never throws" contract.
- `src/index.js` also registers process-level `uncaughtException`/`unhandledRejection` handlers as a safety net for errors outside Express's request cycle (Express 5 already routes in-request errors to `errorHandler`). This is `isOperational`'s only consumer: an `AppError` reaching there is logged and the process keeps running; anything else is treated as a bug with possibly-corrupted process state, so it's logged and the process exits (`process.exit(1)`) to be restarted clean.
