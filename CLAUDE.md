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
CORS_ORIGIN=<frontend origin, e.g. http://localhost:5173>
```
`JWT_ACCESS_SECRET` is optional in dev only: if unset,
`src/services/authService.js` falls back to a hardcoded insecure secret and
logs a warning, so `npm run dev` keeps working with zero config. In
`NODE_ENV=production`, it's required — `src/index.js` refuses to start
(`assertProductionSecrets()`, called from `main()`) if it's missing.
`CORS_ORIGIN` is unset by default, which disables CORS entirely (no `*`
fallback, since cookie-based auth needs `credentials: true`, which browsers
reject when combined with a wildcard origin).

## Architecture

Express 5 REST API using ES Modules (`"type": "module"`). API is versioned under `/api`.

**Data layer**
- `src/models/Task.js` — Mongoose schema/model for the `tasks` collection. Uses the schema's `timestamps: true` option, so `createdAt`/`updatedAt` are managed entirely by Mongoose (set on `create()`, refreshed on every update — including `toggle`'s aggregation-pipeline update) rather than by route/service code. Defines a `toJSON` transform that renames `_id` to `id` and drops `_id` — no manual reshaping needed elsewhere. `userId` (required, `ref: 'User'`) records the creator; serialized as a plain hex string by Mongo's default `ObjectId`→JSON conversion, no populate.
- `src/models/User.js` — Mongoose schema/model for the `users` collection. `email` has a `unique` index (duplicate registration surfaces as a Mongo `code: 11000` error, translated to 409 by `errorHandler.js`). `passwordHash` is `select: false` (excluded from normal queries) and also stripped explicitly in the `toJSON` transform as defense in depth, since `userService.js` does `.select('+passwordHash')` for login, which reintroduces it onto the in-memory document. No other auth-related fields live on this model — sessions are stateless JWTs, there's nothing to persist.
- `src/services/taskService.js` — CRUD service built on the `Task` model. All functions are async and return hydrated Mongoose documents (not `.lean()`) so the model's `toJSON` transform runs when Express serializes the response. `toggle` uses an aggregation pipeline update for an atomic flip of `completed`. Ownership checks are **not** done here — routes fetch with `getById` first and compare `task.userId` before calling `update`/`remove`/`toggle`, same pattern already used for 404s.
- `src/services/userService.js` — user persistence/credentials only (hashing with `bcryptjs`, `email` uniqueness via the schema index). Knows nothing about JWTs or cookies.
- `src/services/authService.js` — JWT issuance/verification only. No session state, no DB access at all (doesn't import `userService` or `User`). `issueSession` signs a single access token and sets the cookie; that's the entire session lifecycle — no refresh token, no rotation, no revocation. The access token TTL (12h) is a hardcoded constant here rather than an env var — see the comment in the file for why (it must stay in sync with the cookie `maxAge` in `src/utils/cookies.js`, and isn't the kind of value that varies per deployment environment). Also owns the dev-only insecure-secret fallback (see Environment above).
- `src/utils/cookies.js` — single place that defines cookie options for the one session cookie, `accessToken` (`httpOnly`, `secure` gated on `NODE_ENV==='production'`, `sameSite: 'lax'`, `path: '/'`, `maxAge` 12h). Both the code that sets it and the code that clears it goes through here, since `clearCookie` needs matching options (especially `path`) to actually remove a cookie the browser holds.
- `src/db/mongoClient.js` — Singleton connection (connect once at startup, expose `getDB()`/`disconnectDB()`). Starts an in-memory `mongod` via `mongodb-memory-server` and connects Mongoose to it — no MongoDB Atlas / external URI involved. `getDB()` exposes the underlying native `Db` object (`mongoose.connection.db`), used by the health check. `disconnectDB()` closes the Mongoose connection and stops the in-memory `mongod`; called on `SIGINT`/`SIGTERM` in `src/index.js` so no orphan `mongod` process is left running.
- `src/services/fileStore.js` — legacy JSON file store, no longer wired up.
- `src/docs/openapi.js` — OpenAPI 3.0 spec (central object). Consumed by `swagger-ui-express` to render the interactive docs at `/api` and exposed as raw JSON at `/api/openapi.json`.

**Auth**
- Registration (`POST /api/auth/register`) takes `firstName`/`lastName`/`email`/`password` (min 8 chars), hashes the password with `bcryptjs`, and does **not** start a session — the client calls `/auth/login` separately.
- Login (`POST /api/auth/login`) verifies credentials with a generic "Credenciales inválidas" message (doesn't reveal whether the email exists) and, on success, calls `authService.issueSession`: signs a single access token (12h) and sets the `accessToken` cookie. Nothing is persisted — there's no session state on `User` or anywhere else.
- Every request under `/api/*` (except `/health`) passes through `attachUser` (`src/middleware/auth.js`), mounted globally in `src/index.js`. It never throws: it verifies the `accessToken` cookie; if valid, it sets `req.user`; if missing/invalid/expired, it clears the cookie and leaves `req.user = null` — there's no renewal of any kind. Routes that must reject anonymous requests add `requireAuth` (throws `AppError(…, 401)` if `req.user` is null). Sessions are pure stateless JWTs: once the 12h token expires, the only way back in is `/auth/login` again.
- **No revocation, no single-session enforcement**: there's no server-side session state, so there's nothing to invalidate. Logging in on a second device doesn't affect the first — both tokens stay valid independently until they naturally expire — and logout cannot revoke an already-issued token, only clear the cookie client-side. This is an explicit, accepted trade-off for a simpler, fully stateless auth model (no refresh token, no `Session`/`RefreshToken` collection, no per-user session field).
- Logout (`POST /api/auth/logout`) is intentionally **not** gated by `requireAuth` — requiring a still-valid access token would leave the cookie stuck client-side if it had already expired. It's purely client-side: clears the `accessToken` cookie and responds 200, no DB interaction at all.
- Task authorization: `POST /api/tasks` requires `requireAuth` and stamps `userId` from `req.user`. `PATCH /api/tasks/:id[/toggle]` and `DELETE /api/tasks/:id` require `requireAuth` *and* ownership (`task.userId === req.user.id`, checked in the route via a local `assertOwner` helper) — a non-owner gets `403`, not `404`, since tasks are publicly readable anyway so there's nothing to hide. `GET` routes stay fully public.
- CORS (`cors` package, in `src/index.js`) is configured with `credentials: true` and `origin` bound to `CORS_ORIGIN` (or `false` if unset) — no `*`, which browsers reject alongside `credentials: true`.

**Request flow**
```
src/index.js    →  /api/auth         →  src/routes/auth.js   →  src/services/authService.js / userService.js    → MongoDB
                →  /api/tasks        →  src/routes/tasks.js  →  src/services/taskService.js                     →  MongoDB
                →  /api              →  swagger-ui-express   →  src/docs/openapi.js
                →  /api/openapi.json →  src/docs/openapi.js
                →  /health           →  src/routes/health.js  →  src/db/mongoClient.js                          →  MongoDB
```
`attachUser` (`src/middleware/auth.js`) sits in front of every `/api/*` route (mounted before both `auth` and `tasks` routers) and resolves `req.user` before any router-specific logic runs.

**Task schema**: `{ id (ObjectId string), title, description, priority ("low"|"mid"|"high"), completed (bool), userId (ObjectId string, creator), createdAt, updatedAt }`

**User schema**: `{ id (ObjectId string), firstName, lastName, email, createdAt, updatedAt }` (`passwordHash` never serializes, see `src/models/User.js`; there are no refresh-token fields).

**Input handling**
- `title` and `description` are trimmed at the route layer before validation. A whitespace-only `title` is rejected with 400.
- `firstName`/`lastName`/`email` are trimmed at the route layer in `src/routes/auth.js`; `email` is additionally lowercased and checked against a basic format regex. `password` must be at least 8 characters.
- `POST /api/auth/register` and `POST /api/auth/login` are rate-limited (`express-rate-limit`, 10 requests / 15 min per IP) to blunt brute-force attempts; `/auth/logout` is not.

**Error handling**
- `src/errors/AppError.js` — small operational-error class (`message`, `status`, `isOperational: true`). Route handlers `throw new AppError(msg, status)` for expected failures (validation, not found) instead of building `res.status().json()` responses by hand; Express 5 forwards both thrown errors and rejected promises from async handlers to the centralized error handler automatically.
- `src/middleware/notFound.js` — catch-all mounted after all routes; turns any unmatched route into a 404 `AppError`.
- `src/middleware/errorHandler.js` — the single place that turns an error into a response. Translates Mongoose `CastError` (malformed ObjectId) and `ValidationError` into 400s, and a Mongo duplicate-key error (`err.code === 11000`, e.g. registering an already-used email) into 409; everything else falls back to `err.status || err.statusCode || 500` (`statusCode` is checked too since some third-party middleware — e.g. `express.json()`'s malformed-JSON `SyntaxError` — uses that property instead of `status`). Every error response has the same shape: `{ status, error }`. Stack traces are only logged to console for 5xx errors; 4xx errors (malformed JSON, not found, validation) are silent in the console. `jsonwebtoken` errors never reach this handler directly — `authService.safeVerify` catches them internally so `attachUser` can honor its "never throws" contract.
- `src/index.js` also registers process-level `uncaughtException`/`unhandledRejection` handlers as a safety net for errors outside Express's request cycle (Express 5 already routes in-request errors to `errorHandler`). This is `isOperational`'s only consumer: an `AppError` reaching there is logged and the process keeps running; anything else is treated as a bug with possibly-corrupted process state, so it's logged and the process exits (`process.exit(1)`) to be restarted clean.
