# FinSafe API

FinSafe is a Node.js + TypeScript transaction API for a fictional fintech. It implements a JWT-backed authentication flow (with rotating, bcrypt-hashed refresh tokens) and an **idempotent payment** endpoint that charges a pre-funded user balance.

It runs on **Express 5** with **Prisma ORM 7** (PostgreSQL through the Neon driver adapter), Redis, `zod` validation, and structured (pino) + Wide `AsyncLocalStorage`-based request logging.

> **Note on the ORM:** this project was originally scaffolded on the Prisma 8 release-candidate "contract-based" ORM (`@prisma/orm-postgres`, `@prisma/cli-engine`, `src/prisma/contract.prisma`). It has been migrated back to the **stable Prisma 7** classic stack: `prisma/schema.prisma` + generated `@prisma/client`. See [Design Decisions](#design-decisions).

---

## Architecture Diagram

### High-level component flow

```mermaid
flowchart LR
    C["Client (Postman / Web)"] -->|"HTTP + Bearer JWT"| E

    subgraph Express["Express 5 app (src/app.ts)"]
        direction TB
        M["Middleware stack"]
        A["auth.routes"] --> CT["Controllers"]
        P["payment.routes"] --> CT
        CT --> DB
    end

    subgraph Middleware["Middleware chain (in order)"]
        direction LR
        H["helmet / cors / compression / cookie-parser"]
        L["WideLogger (trace id, timing)"]
        V["validateBody (zod)"]
        AU["authenticateToken (JWT)"]
        I["idempotencyCheck"]
        BAL["balanceCheck"]
    end

    M --- H --- L
    subgraph DB["Persistence layer"]
        direction LR
        PC["PrismaClient 7 + @prisma/adapter-neon"]
        PG[("PostgreSQL 15+ (Neon)")]
    end
    PC --> PG
    CT --> PC
    CT -->|"Refresh token hashing"| BC["bcrypt"]
    CT --> JWT["jose (HS256)"]
    L --> REDIS[("Redis")]
    E -->|"pino"| LOG["pino-pretty / JSON logs"]
```

### Payment request sequence

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant E as Express
    participant AU as authenticateToken
    participant V as validateBody (zod)
    participant I as idempotencyCheck
    participant B as balanceCheck
    participant P as processPayment
    participant D as Prisma 7 (PostgreSQL)

    C->>E: POST /api/v1/transaction/process-payment<br/>(Bearer token, Idempotency-Key, {amount, currency})
    E->>AU: verify access JWT
    AU-->>E: 401 MISSING_TOKEN / TOKEN_EXPIRED / INVALID_TOKEN
    AU->>V: attach user -> next()
    V-->>E: 400 VALIDATION_FAILED
    V->>I: validated body
    I->>D: find existing payment (email + idempotencyKey)
    alt same key + same body (replay)
        I -->>C: 201 "Charged …" + X-Cache-Hit: true
    else same key + different body (fraud attempt)
        I -->>C: 409 "Idempotency key already used…"
    else key missing
        I -->>C: 400 MISSING_KEY
    end
    I->>B: valid idempotency
    B->>D: SELECT balance
    alt amount >= balance
        B -->>C: 400 "You do not have enough funds…"
    end
    B->>P: next()
    P->>D: create Payment + debit User balance
    P-->>C: 201 "Charged 250 GHS"
```

---

## Setup Instructions

### Prerequisites

- **Node.js ≥ 20** (project built and tested on Node 24)
- **PostgreSQL ≥ 15** (local, or a [Neon](https://neon.tech) connection string)
- **Redis** (for the config/health side of the stack; falls back to `redis://localhost:6379`)
- **npm** ≥ 10

### 1. Clone and install

```bash
git clone <your-repo-url>
cd FinSafe
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in real values. Required variables:

| Variable                   | Example                                    | Notes                                            |
| -------------------------- | ------------------------------------------ | ------------------------------------------------ |
| `DATABASE_URL`             | `postgresql://user:pass@host:5432/finsafe` | Must start with `postgresql://`; PostgreSQL ≥ 15 |
| `REDIS_URL`                | `redis://localhost:6379`                   |                                                  |
| `FRONTEND_URL`             | `https://localhost:5173`                   | Must start with `https://`; used for CORS        |
| `ACCESS_TOKEN_SECRET`      | `<32+ random chars>`                       | Min 32 chars                                     |
| `REFRESH_TOKEN_SECRET`     | `<32+ random chars>`                       | Min 32 chars                                     |
| `PORT`                     | `3000`                                     | Default `3000`                                   |
| `NODE_ENV`                 | `dev`                                      | `dev` \| `test` \| `prod`                        |
| `ACCESS_TOKEN_EXPIRES_IN`  | `15m`                                      | jose duration format                             |
| `REFRESH_TOKEN_EXPIRES_IN` | `7d`                                       | jose duration format                             |
| `BCRYPT_ROUNDS`            | `12`                                       | 10–20                                            |
| `USER_BALANCE`             | `1000`                                     | Opening balance granted to new users             |

### 3. Create the database schema

```bash
# Development — creates migrations and applies them
npm run p:mig -- --name init

# Alternatively: push schema without a migration history
npm run p:push

# Production deployments
npm run p:mig:prod
```

Prisma 7 keeps the connection URL in `prisma.config.ts` (not in `schema.prisma`), and the generated client is configured with the Neon driver adapter in `src/config/prisma.ts`. Regenerate the client any time you edit `prisma/schema.prisma`:

```bash
npm run p:gen
```

### 4. Run

```bash
npm run dev        # tsx watch (hot reload)  -> http://localhost:3000
npm run build      # tsc -> dist/
npm start          # node dist/server.js
```

Verify with:

```bash
curl http://localhost:3000/health
# {"status":"OK","service":"Transactional App Service","date":"…"}
```

### Scripts

| Command              | Purpose                                         |
| -------------------- | ----------------------------------------------- |
| `npm run dev`        | Watch-mode dev server via `tsx`                 |
| `npm run build`      | Compile TypeScript to `dist/`                   |
| `npm start`          | Run compiled server                             |
| `npm run typecheck`  | `tsc --noEmit`                                  |
| `npm run p:mig`      | `prisma migrate dev` (create & apply migration) |
| `npm run p:mig:prod` | `prisma migrate deploy`                         |
| `npm run p:push`     | `prisma db push`                                |
| `npm run p:studio`   | Browse the database in Prisma Studio            |
| `npm run p:gen`      | Regenerate the Prisma client                    |

### Postman

A ready-to-import collection is included at [`postman/FinSafe.postman_collection.json`](postman/FinSafe.postman_collection.json).

1. Open Postman → **Import** → choose the file.
2. Collection variable `baseUrl` defaults to `http://localhost:3000`.
3. Hit **Register** → **Login** (tests auto-store the access token in `{{accessToken}}`), then **Process Payment** with the `Idempotency-Key` header.

---

## API Documentation

Base URL: `http://localhost:3000` (override with `PORT`). All endpoints are namespaced under `/api/v1` except `/health`.

### Conventions

- Request/response bodies are JSON (`Content-Type: application/json`).
- Auth: send `Authorization: Bearer <accessToken>`, or rely on the `token` httpOnly cookie set on login/register.
- Error shape from the app: `{ "status": "error", "code": "<CODE>", "message": "…" }`
- Zod validation errors: `{ "status": "error", "code": "VALIDATION_FAILED", "message": "…", "details": [{ "field", "code", "message" }] }`
- Database (Prisma) errors are mapped to HTTP statuses (`P2002` → 409, `P2001`/`P2005` → 404, `P2000` → 400, …).

### `GET /health`

Liveness probe.

```jsonc
// 200 OK
{
  "status": "OK",
  "service": "Transactional App Service",
  "date": "2026-09-24T04:14:10.200Z",
}
```

### `POST /api/v1/auth/register`

Creates a user (balance seeded with `USER_BALANCE`), hashes the password, issues an access + refresh token pair (also set as httpOnly cookies: `token`, `refreshToken`).

**Body**

```json
{
  "email": "alice@example.com",
  "password": "password123",
  "confirmPassword": "password123"
}
```

**Success — `201 Created`**

```jsonc
{
  "status": "success",
  "message": "User account successfully created",
  "accessToken": "<jwt>",
  "refreshToken": "<jwt>",
  "user": {
    "id": "6f6e…",
    "email": "alice@example.com",
    "createdAt": "…",
    "updatedAt": "…",
  },
}
```

**Errors:** `400 VALIDATION_FAILED` (weak password / mismatch / bad email) · `409 CONFLICT` (`An account with this email already exits`).

### `POST /api/v1/auth/login`

**Body**

```json
{
  "email": "alice@example.com",
  "password": "password123"
}
```

**Success — `200 OK`** — same token shape as register plus the full user record.
**Errors:** `400 BAD_REQUEST` (unknown email) · `401 UNAUTHORIZED` (wrong password) · `400 VALIDATION_FAILED`.

### `POST /api/v1/auth/refresh`

Issues a fresh token pair. The refresh token is validated, must match (bcrypt) the one stored on the user, and is **rotated** — the 7-day window extends and the old token is invalidated. Tokens can be sent in the body or the `refreshToken` cookie.

**Body**

```json
{ "refreshToken": "<refresh token from login/register>" }
```

**Success — `200 OK`**

```jsonc
{
  "status": "success",
  "data": {
    "newAccessToken": "<jwt>",
    "newRefreshToken": "<jwt>",
  },
}
```

**Errors:** `401 MISSING_TOKEN` · `401 INVALID_TOKEN` (invalid/expired/mismatched).

### `GET /api/v1/auth/logout`

Clears the stored refresh token and the auth cookies. Requires a valid session (`Authorization` header or `token` cookie).

**Success — `200 OK`**

```json
{ "status": "success", "message": "User logged out succesfully!" }
```

**Errors:** `400 UNAUTHORIZED` (no session) · auth middleware codes above.

### `POST /api/v1/transaction/process-payment`

Charges the authenticated user's balance. Idempotent.

**Headers**

| Header            | Value                                           | Required |
| ----------------- | ----------------------------------------------- | -------- |
| `Authorization`   | `Bearer <accessToken>`                          | yes\*    |
| `Idempotency-Key` | any unique string (e.g. UUID per client action) | yes      |
| `Content-Type`    | `application/json`                              | yes      |

\* or use the `token` cookie.

**Body**

```json
{
  "amount": 250,
  "currency": "GHS" // GHS | USD | GBP
}
```

**Success — `201 Created`**

```json
{ "status": "success", "message": "Charged 250 GHS" }
```

**Idempotent replay** — re-sending the same key + same body returns the cached result with an `X-Cache-Hit: true` response header (no second charge).
**Idempotency conflict** — same key + different body:

```jsonc
// 409 Conflict
{
  "status": "fail",
  "message": "Idempotency key already used for a different request body!",
}
```

**Insufficient funds:**

```jsonc
// 400 Bad Request
{
  "status": "fail",
  "message": "You do not have enough funds to perform this transaction!",
}
```

**Other errors:** `401 MISSING_TOKEN/TOKEN_EXPIRED/INVALID_TOKEN` · `400 MISSING_KEY` (missing `Idempotency-Key`) · `400 VALIDATION_FAILED` · `409` (Prisma `P2002` unique violation on the key).

---

## Project Structure

```
FinSafe/
├── prisma/
│   ├── schema.prisma            # Prisma 7 data contract (User, Payment)
│   └── migrations/              # Generated SQL migrations
├── prisma.config.ts             # Prisma 7 CLI config (connection URL)
├── postman/
│   └── FinSafe.postman_collection.json
├── src/
│   ├── server.ts                # Bootstrap, graceful shutdown
│   ├── app.ts                   # Express app, security/CORS/middleware wiring
│   ├── env.ts                   # Zod-validated environment schema
│   ├── config/
│   │   ├── prisma.ts            # PrismaClient + PrismaNeon adapter singleton
│   │   └── redis.ts             # Redis client
│   ├── controllers/             # auth + payment handlers
│   ├── routes/                  # /api/v1/auth, /api/v1/transaction
│   ├── middlewares/             # auth, validation, payment (idempotency/balance), error handler, wide logger
│   ├── schema/                  # zod schemas (auth, payment)
│   ├── utils/                   # JWT (jose), bcrypt, cookies, AppError, loggers
│   └── types/                   # express.d.ts augmentation
```

### Data model

```prisma
enum Currency { GHS; USD; GBP }

model User {
  id                  String   @id @default(uuid())
  email               String   @unique
  password            String?
  balance             Int      @default(1000)
  refreshToken        String?          // bcrypt-hashed
  refreshTokenExpires DateTime?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  @@map("Users")
}

model Payment {
  id             String   @id @default(uuid())
  email          String
  idempotencyKey String   @unique
  amount         Int
  currency       Currency
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@unique([email, idempotencyKey])
  @@map("Payments")
}
```

---

## Design Decisions

- **Prisma 7 instead of the Prisma 8 RC.** The original scaffold used the new "contract-based" ORM (`@prisma/orm-postgres`, `@prisma/cli-engine`, `src/prisma/contract.prisma`). Prisma 7 is the stable release line with a mature migration toolchain, first-class **driver adapters** (`@prisma/adapter-neon`), and a predictable `prisma-client-js` generator. The downgrade removed the contract packages and `migrations/` (new-style), moved the schema to `prisma/schema.prisma`, and put the connection URL in `prisma.config.ts`.
- **Driver adapter is required in Prisma 7.** `PrismaClient` is constructed with the `PrismaNeon` adapter (`src/config/prisma.ts:17`), so the same app runs against Neon/Supabase serverless or any PostgreSQL 15+ endpoint; the pooler also supplies the `ws` WebSocket used by Neon.
- **Token security:** refresh tokens are stored **bcrypt-hashed** (never plaintext) and **rotated on every use**, extending the 7-day sliding window while invalidating the previous token — limits replay damage if a database is leaked.
- **Idempotent payments:** the `Idempotency-Key` header combined with a `@@unique([email, idempotencyKey])` constraint guarantees a client retry never double-charges; replays short-circuit with `X-Cache-Hit: true`.
- **Layered middleware pipeline** keeps each concern isolated and testable: `authenticateToken → validateBody → idempotencyCheck → balanceCheck → processPayment`.
- **PostgreSQL enum** keeps `currency` type-safe at the database level, and the Zod schema now validates against the same `GHS | USD | GBP` union so bad input fails fast at the edge (400) instead of surfacing as a DB error (500).
- **Structured + wide logging:** pino emits JSON (or pretty in dev) enriched by an `AsyncLocalStorage`-based logger that carries trace/span ids, HTTP metadata, duration, and per-action context — friendly to APM pipelines.
- **Defensive error layer:** `AppError` produces stable error `code`s, and Prisma error codes (`P2000`, `P2001`, `P2002`, `P2003`, `P2005`) are translated into user-safe messages with correct HTTP statuses.
- **Zod-validated env:** the process refuses to boot with missing/malformed secrets, DB URL, or CORS origin rather than failing later at runtime.

---

## The Developer's Choice

**Added feature: balance check middleware (`balanceCheck`).**

In a real fintech, rejecting overdrafts at the edge is far better than letting a charge silently push a user negative (or fail on a constraint mid-flight). On every `process-payment`, after authentication and idempotency verification, `balanceCheck` (see `src/middlewares/payment.middleware.ts`) reads the user's balance and short-circuits the transaction with a clear `400` if the requested `amount` cannot be covered:

```json
{
  "status": "fail",
  "message": "You do not have enough funds to perform this transaction!"
}
```

Why this feature:

- **Correctness at the boundary** — the payment is never persisted unless it is provably affordable, so account balances can never go negative through this API.
- **Clear client contract** — a deterministic, documented `400` beats an unexplained database failure.
- **Composable middleware** — it slots into the existing pipeline (`authenticateToken → validateBody → idempotencyCheck → balanceCheck → processPayment`) with no changes to the controller contract.

This is the "developer's choice" safety feature (a second one documented inline in the code is refresh-token rotation + hashing, described under [Design Decisions](#design-decisions)).

---

## Migrating from the Prisma 8 scaffold (for reference)

If you are coming from the pre-downgrade commit, these are the changes that were applied:

1. `prisma/schema.prisma` created (classic `generator client` / `datasource db`) — `src/prisma/contract.prisma` removed.
2. `prisma.config.ts` rewritten using `defineConfig` from `prisma/config` with the `datasource.url` from `DATABASE_URL`.
3. `package.json`: removed `@prisma/orm-postgres`, `@prisma/cli-engine`; pinned `prisma` to `^7.10.0`; removed `contract:emit`.
4. New-style `migrations/` folder removed; fresh migrations are created under `prisma/migrations/` via `npm run p:mig`.
5. `src/prisma/` (contract + runtime client) removed; all queries use the generated client from `src/config/prisma.ts`.
6. Express 5 incompatibilities fixed: the `app.all("/.*/", …)` catch-all 404 was replaced with a middleware-based 404, and relative imports were given `.js` extensions for ESM-compliant `dist`output.
