# POS System — Architecture Document

> **Status:** Phase 0 — foundation scaffold. No feature code yet.  
> **Last updated:** 2026-07-06

This document is the single source of truth for how the product is structured, why key decisions were made, and what gets built in which order. It reflects the product brief and adds implementation-level detail needed before writing feature code.

---

## Table of Contents

1. [Product Summary](#1-product-summary)
2. [Deployment Model](#2-deployment-model)
3. [Tech Stack & Rationale](#3-tech-stack--rationale)
4. [Repository Layout](#4-repository-layout)
5. [Backend Module Design](#5-backend-module-design)
6. [Multi-Tenancy & Access Control](#6-multi-tenancy--access-control)
7. [Feature Flags & Licensing](#7-feature-flags--licensing)
8. [Udhaar (Customer Ledger) Design](#8-udhaar-customer-ledger-design)
9. [Optional Features Pattern](#9-optional-features-pattern)
10. [Offline-First & Sync Engine](#10-offline-first--sync-engine)
11. [Electron & Local PostgreSQL Lifecycle](#11-electron--local-postgresql-lifecycle)
12. [Frontend Architecture](#12-frontend-architecture)
13. [Background Jobs](#13-background-jobs)
14. [Security & Non-Functional Requirements](#14-security--non-functional-requirements)
15. [Testing Strategy](#15-testing-strategy)
16. [Build Order](#16-build-order)
17. [Decisions & Alternative Approaches](#17-decisions--alternative-approaches)

---

## 1. Product Summary

A packaged POS for SMBs in Karachi (kiryana, restaurants, fashion, pharmacies), sold from **one codebase** in three modes:

| Mode                | Connectivity                       | Database                 | Tenancy                                   |
| ------------------- | ---------------------------------- | ------------------------ | ----------------------------------------- |
| **Offline license** | None after activation              | Local PostgreSQL         | Single-tenant per install                 |
| **Cloud SaaS**      | Always online                      | Hosted PostgreSQL        | Multi-tenant (shared DB)                  |
| **Hybrid**          | Offline-first, sync when available | Local + cloud PostgreSQL | Single-tenant locally; cloud row for sync |

**Competitive edge:** offline-first operation with reliable udhaar (credit ledger) — built as a first-class module, not a bolt-on.

**Tiering:** Starter / Standard / Pro / Enterprise are **presets** that pre-fill feature toggles. Super Admin (and license keys) can enable any custom combination — tiers are not a hard ceiling.

---

## 2. Deployment Model

```
┌─────────────────────────────────────────────────────────────────┐
│                     ONE CODEBASE                                  │
│  /front (React)  +  /backend (Node/Fastify)  +  /shared (types) │
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
   ┌──────────┐        ┌──────────┐        ┌──────────────┐
   │  Cloud   │        │ Offline  │        │   Hybrid     │
   │ Browser  │        │ Electron │        │  Electron    │
   │  → API   │        │ embedded │        │  embedded    │
   │          │        │ API+PG   │        │ API+PG+sync  │
   └──────────┘        └──────────┘        └──────────────┘
```

### Core rule

Business logic **never branches** on deployment mode. The only differences are:

- `DATABASE_URL` (and sync worker configuration)
- Whether the sync background worker is active
- Whether multi-tenant middleware enforces `tenant_id` from JWT vs. a fixed local tenant
- License validation on offline installs

All queries, services, and permission checks are identical across targets.

---

## 3. Tech Stack & Rationale

| Layer            | Choice                                          | Notes                                          |
| ---------------- | ----------------------------------------------- | ---------------------------------------------- |
| **Frontend**     | React 19 + Vite + Tailwind CSS + TanStack Query | Fast dev, modern tooling, server-state caching |
| **Backend**      | **Node.js + Fastify**                           | See [§17.1](#171-fastify-vs-express)           |
| **Language**     | **TypeScript** (front, back, electron, shared)  | Non-negotiable for a codebase this size        |
| **ORM**          | **Prisma**                                      | See [§17.2](#172-prisma-vs-alternatives)       |
| **Database**     | PostgreSQL everywhere                           | Same schema/migrations; no SQLite              |
| **Auth**         | JWT (access + refresh tokens)                   | Stateless API; refresh rotation                |
| **Desktop**      | Electron hosting embedded backend               | No separate backend binary                     |
| **Cloud jobs**   | BullMQ + Redis                                  | Sync retries, reports, FBR                     |
| **Offline jobs** | In-process queue + `node-cron`                  | No Redis dependency offline                    |
| **Mobile**       | React Native + Expo                             | Phase 7 only; no PWA                           |

---

## 4. Repository Layout

```
/
├── ARCHITECTURE.md          ← this file
├── package.json             ← npm workspaces root
├── .github/workflows/ci.yml
├── shared/                  ← TypeScript types ONLY (API shapes, feature keys)
│   └── src/
├── front/                   ← React SPA
│   └── src/
│       ├── app/             ← routing, providers, layout shell
│       ├── features/        ← domain-aligned UI (billing/, customers/, …)
│       ├── components/      ← shared UI primitives
│       ├── hooks/
│       └── lib/             ← api client, auth helpers
├── backend/                 ← Fastify API
│   └── src/
│       ├── modules/         ← domain modules (see §5)
│       ├── plugins/         ← Fastify plugins (auth, tenant, prisma)
│       └── index.ts
├── electron/                ← Desktop wrapper
│   └── src/
│       ├── main.ts          ← window, tray, lifecycle
│       ├── postgres/        ← local PG lifecycle manager
│       └── backend-host.ts  ← starts embedded Fastify
├── mobile/                  ← placeholder (Phase 7)
└── docs/
    ├── SCHEMA.md            ← database design for steps 2–3
    └── setup/
```

### Separation rules

- `/front` and `/backend` **never import each other**.
- `/shared` contains **types and constants only** — no runtime logic, no React, no Prisma.
- Each backend domain module owns its routes, services, and Zod/JSON schemas. Prisma models live in one `schema.prisma` (Prisma requirement) but services stay in domain folders.

---

## 5. Backend Module Design

Each module under `backend/src/modules/` is a self-contained unit:

```
modules/billing/
├── billing.routes.ts      ← Fastify route registration
├── billing.service.ts     ← business logic
├── billing.schemas.ts     ← request/response validation (TypeBox or Zod)
└── billing.test.ts        ← unit/integration tests
```

### Phase 1 modules

| Module         | Responsibility                                                                    |
| -------------- | --------------------------------------------------------------------------------- |
| `core/`        | Config, Prisma client, error types, pagination helpers, deployment mode detection |
| `auth/`        | Login, refresh, password reset, JWT issuance                                      |
| `permissions/` | Feature registry, tenant features, staff features, middleware                     |
| `tenants/`     | Tenant CRUD (Super Admin), business profile                                       |
| `users/`       | Staff accounts, role assignment                                                   |
| `inventory/`   | Products, categories, stock movements, barcode lookup                             |
| `billing/`     | Sales, cart, discounts, payments, receipt payload generation                      |
| `customers/`   | Customer CRUD, **udhaar ledger**, credit limits, aging, statements                |
| `reports/`     | Daily sales, basic charts, udhaar aging (Phase 1 scope)                           |
| `settings/`    | Business profile, printer prefs, tax fields, license status                       |
| `audit/`       | Immutable audit log for sensitive actions                                         |

### Later modules (feature-flagged)

`delivery/`, `fbr/`, `multi-branch/`, `analytics/`, `suppliers/`, `expenses/`, `sync/`

### Auth module scope

| Feature                              | Status                                                                                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Login / refresh / logout             | Implemented (Step 2)                                                                                                                         |
| JWT access + rotating refresh tokens | Implemented                                                                                                                                  |
| `must_change_password` enforcement   | Implemented                                                                                                                                  |
| Password reset (email/token flow)    | **Deferred** — requires outbound email or admin reset UI; not needed for offline-first MVP. Client Admin can reset staff passwords directly. |
| Password reset for Super Admin       | Use `POST /auth/change-password` after first login                                                                                           |

### Request flow

```
HTTP Request
  → Fastify plugin: authenticate JWT
  → Fastify plugin: resolve tenant context (from JWT or local config)
  → Fastify plugin: check feature permission for route
  → Route handler → Service → Prisma (always filtered by tenant_id)
  → Response
```

---

## 6. Multi-Tenancy & Access Control

### Tenancy model

- **Shared database, row-level isolation** via `tenant_id` on every business-owned table.
- Enforced at the **query layer**, not left to individual developers:
  - A Prisma client extension (or service base class) automatically injects `WHERE tenant_id = ?` on all reads/writes.
  - Offline installs use a fixed `tenant_id` baked in at activation; middleware is a no-op pass-through with that ID.
- Indexed: every table has `@@index([tenantId])` at minimum; composite indexes on hot query paths.

### Role hierarchy

| Role             | Scope       | Capabilities                                                                        |
| ---------------- | ----------- | ----------------------------------------------------------------------------------- |
| **Super Admin**  | All tenants | Create tenants, set tenant features, issue license keys, cross-tenant reports       |
| **Client Admin** | Own tenant  | Full tenant access, create staff, assign staff features (subset of tenant features) |
| **Staff**        | Own tenant  | Only features explicitly granted by Client Admin                                    |

Roles are stored on the `users` record. Permissions are **feature-key based**, not role-name based — roles are convenience defaults when creating users, not the enforcement mechanism.

### Permission enforcement

1. **Central feature registry** — canonical list of feature keys (see `shared/src/features.ts`).
2. **`tenant_features`** — which features the tenant's package includes (set by Super Admin or decoded from license key).
3. **`staff_features`** — which features a staff user may use (set by Client Admin; must be ⊆ tenant features).

Every protected route declares its required feature key(s). Middleware checks:

```
staff has feature? AND tenant has feature? → allow
else → 403
```

Frontend menu/button visibility mirrors permissions for UX only. **Server is the security boundary.**

### Discount limits example

Rather than hardcoding "cashiers max 10% discount", use:

- Feature `billing.discount` — can apply discounts at all
- Feature `billing.discount_unlimited` — no cap (manager/admin)
- Tenant setting `max_discount_percent_staff` — numeric cap for staff without unlimited permission

---

## 7. Feature Flags & Licensing

### Feature keys

Stored in `shared/src/features.ts` as a const object — single source for front and back. Backend imports from shared; frontend imports from shared. No duplication.

### Tier presets

`tenant_tier_presets` table maps tier name → list of feature keys. Applying a tier **replaces** tenant features with the preset list, but Super Admin can then toggle individual features. Same mechanism for license keys.

### Offline license flow

```
1. Client installs Electron app
2. App reads hardware fingerprint (CPU + disk serial hash)
3. Client enters license key → one-time online validation against vendor API
4. Server returns: tenant config + enabled features + JWT signing secret for local auth
5. License + features cached locally (encrypted); app works offline indefinitely
6. Adding a module → vendor issues new key → one-time online re-validation → features updated locally
```

License payload is signed (Ed25519 or HMAC) so local tampering is detectable. Feature list is stored in local DB, not just a config file.

---

## 8. Udhaar (Customer Ledger) Design

This is the most important domain module. It is **not** a `balance` field on the customer row with manual updates.

### Principles

1. **Append-only ledger** — every credit sale and every payment is an immutable entry (voids create reversing entries, never deletes).
2. **Denormalized balance** — `customers.balance` is updated transactionally with each entry for fast display; ledger is source of truth for audit. **`balance` is never synced via LWW** — it is recomputed from ledger entries during sync reconciliation (see §10).
3. **Credit obligations for aging** — each credit sale creates a `customer_credit_obligations` row with `remaining_amount`. Payments apply FIFO against open obligations. Aging buckets (0–7 / 8–30 / 30+ days) are computed from obligation `created_at` and `remaining_amount > 0`.
4. **Row-level locking** — every ledger write acquires `SELECT … FOR UPDATE` on the customer row before computing `balance_after`, preventing races under concurrent requests.
5. **Offline-first** — all ledger writes commit locally instantly; sync handles obligation conflicts separately (see §10).
6. **Permissions** — `customers.ledger_view`, `customers.ledger_record` (credit sales + payments), `customers.ledger_edit` (void/adjust past entries).

### Sale on credit flow

```
Checkout → payment_method = CREDIT → select customer
  → billing.service creates sale (status: COMPLETED, payment_status: ON_CREDIT)
  → customers.service creates ledger entry (type: CREDIT_SALE, amount: +total)
  → creates credit_obligation (original_amount = total, remaining = total)
  → updates customers.balance += total
  → optional: warn if balance + total > credit_limit (soft warning)
```

### Payment flow

```
Customer profile → "Record Payment" → amount
  → ledger entry (type: PAYMENT, amount: -amount)
  → FIFO: reduce remaining_amount on oldest obligations
  → customers.balance -= amount
```

### Statement export

Generated from ledger entries + customer info; returned as HTML/PDF payload. Printing is optional (same pattern as receipts).

Full table definitions: [`docs/SCHEMA.md`](docs/SCHEMA.md).

---

## 9. Optional Features Pattern

**Nothing is a hard dependency.** The canonical example is thermal printing.

### Pattern

1. **Tenant setting:** `settings.print_receipts_default: boolean` (default `false`)
2. **Per-sale override:** billing screen checkbox "Print receipt" (respects default)
3. **Checkout flow:** sale completes → if print enabled → call `printing.service.generateReceipt(sale)` → if printer unavailable → log warning, show toast, **sale still succeeds**
4. **Printing module:** isolated behind feature flag `billing.print_receipt`; core billing never imports printer drivers directly — uses an interface:

```typescript
interface ReceiptRenderer {
  render(sale: SaleReceiptPayload): Promise<RenderResult>;
}
// Implementations: NullReceiptRenderer (no-op), Thermal80mmRenderer (later)
```

Same pattern applies to: barcode scanner, cash drawer, FBR QR, delivery tracking.

---

## 10. Offline-First & Sync Engine

> **Build order:** Designed now; implemented in Step 5. Documented here so Phase 1 schema includes sync-ready columns.

### Write path (hybrid)

```
UI action → API → local PostgreSQL commit (instant) → enqueue to sync_outbox → return 200
                                              ↓
                              background worker (when online)
                                              ↓
                              push to cloud API → mark synced
                              pull cloud changes → apply locally
```

### Sync outbox

Table `sync_outbox`: persists pending changes across app restarts.

| Column       | Purpose                      |
| ------------ | ---------------------------- |
| `id`         | UUID                         |
| `table_name` | Which entity changed         |
| `record_id`  | PK of changed row            |
| `operation`  | INSERT / UPDATE / DELETE     |
| `payload`    | JSON snapshot                |
| `version`    | Monotonic per-record version |
| `created_at` | For ordering                 |
| `synced_at`  | NULL until pushed            |
| `status`     | PENDING / SYNCED / CONFLICT  |

Every syncable table gets: `version INT`, `updated_at TIMESTAMPTZ`, `deleted_at` (soft delete for sync).

### Conflict resolution (explicit per entity)

| Entity                                                | Strategy                                | Rationale                                                                          |
| ----------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------- |
| Products, categories, customers (profile fields only) | **Last-write-wins** by `updated_at`     | Metadata; rare concurrent edits                                                    |
| `customers.balance`                                   | **Never synced — recompute**            | `SUM(ledger entries)` after sync; LWW would corrupt balance across offline devices |
| Sales, ledger entries                                 | **Append-only; no merge**               | Immutable; conflicts = duplicate detection by client-generated UUID                |
| Stock quantity                                        | **Operational transform / delta merge** | `stock = stock + sum(deltas)` per sync window; reject if negative                  |
| Udhaar obligations                                    | **No automatic merge**                  | Flag conflict for admin review; never silently combine balances                    |
| Settings                                              | **Last-write-wins**                     | Low risk                                                                           |

### Balance reconciliation (hybrid sync)

After applying pulled `customer_ledger_entries` and `customer_payment_allocations`, the sync worker runs:

```
balance = SUM(amount) FROM customer_ledger_entries
          WHERE customer_id = ? AND voided_at IS NULL
UPDATE customers SET balance = balance WHERE id = ?
```

Never apply a remote `customers.balance` value directly.

### Client-generated IDs

All primary keys are **UUIDs generated client-side** so offline devices can create records without a central sequence. Duplicate UUID on sync = idempotent skip.

### Sync device authentication (hybrid ↔ cloud)

- **`SYNC_API_KEY` is per-device, not per-tenant and not a global shared secret.** Each hybrid install receives a unique key when a client admin registers the device on the cloud hub (`POST /sync/devices`). The key is stored hashed in `sync_devices`.
- **`SYNC_DEVICE_ID` is required** on hybrid installs and must match the registered `device_id`. Pull excludes changelog rows from the same device to avoid replaying its own pushes.
- **Cloud `/sync/ingest` and `/sync/changes` do not trust payload `tenant_id` alone.** The API key resolves to `(tenant_id, device_id)`; requests must match exactly or return `403`.
- **Provisioning flow:** Client admin on cloud → register device → copy `apiKey` + `deviceId` into hybrid `.env` alongside `TENANT_ID`.

### Outbox conflict resolution (pre-UI)

| Status     | Meaning                      | Resolution                                                                                                                                                     |
| ---------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PENDING`  | Waiting to push              | Auto on worker / `POST /sync/run`                                                                                                                              |
| `FAILED`   | Transient push/apply error   | Auto-retry on worker / `POST /sync/run`                                                                                                                        |
| `CONFLICT` | Cloud rejected (version/LWW) | **Not** auto-retried; admin uses `POST /sync/outbox/:id/retry` after fixing data, or `POST /sync/outbox/:id/dismiss` to fetch cloud row and reconcile local DB |
| `SYNCED`   | Done                         | —                                                                                                                                                              |

**Dismiss (`accept remote wins`):** Hybrid calls `GET /sync/records/:table/:id` on cloud, then `reconcileLocalWithRemote` — applies the cloud snapshot locally (ledger tables trigger `recomputeCustomerBalance`). If cloud has no row and the outbox op was `INSERT`, the unsynced local row is rolled back. Outbox is marked `SYNCED` only after reconciliation.

**FAILED retry cap:** `retry_count` increments on each cloud `failed` ingest response. Default max **5** (`SYNC_MAX_FAILED_RETRIES`); then status escalates to `CONFLICT` for admin retry/dismiss. Transient network errors do not increment (batch never reaches cloud). Manual `POST /sync/outbox/:id/retry` resets `retry_count` to 0.

`GET /sync/status` exposes `status`, `conflictChanges`, `failedChanges`, and `userMessage` so clients can surface alerts before Step 6 UI exists.

### UI indicator

Global sync status component: `Synced` (green) / `Pending N changes` (amber) / `N conflicts — review` (red).

---

## 11. Electron & Local PostgreSQL Lifecycle

### Components

```
electron/src/
├── main.ts              ← app entry, window management
├── backend-host.ts      ← spawns/requires Fastify backend in-process
├── postgres/
│   ├── manager.ts       ← start/stop/monitor local PG
│   ├── paths.ts         ← data dir: %APPDATA%/POS/data/pg
│   └── init.ts          ← first-run: initdb, run migrations
└── preload.ts           ← secure bridge if needed
```

### Lifecycle

1. **App launch** → check if PG data dir exists
   - No → `initdb`, start PG on ephemeral port, run Prisma migrations, seed default tenant + admin user
   - Yes → start PG on configured port (stored in local config)
2. **Start Fastify** in-process (same Node runtime as Electron main, or forked child process for isolation — start in-process for simplicity, fork later if needed)
3. **Renderer** loads `http://localhost:{apiPort}` or bundled static front assets pointing at local API
4. **App quit** → graceful Fastify shutdown → `pg_ctl stop` → exit

### Bundled PostgreSQL

Ship a pinned PostgreSQL build (e.g. via `embedded-postgres` npm package or platform-specific binaries in `electron/resources/`). Data directory is user-writable and excluded from app updates.

### Port selection

Bind to `127.0.0.1:0` (OS assigns free port) on first run; persist port in `%APPDATA%/POS/config.json`.

---

## 12. Frontend Architecture

### Structure

- **Feature folders** mirror backend domains: `features/billing/`, `features/customers/`, etc.
- Each feature exports its pages and hooks; routing table in `app/routes.tsx`.
- **TanStack Query** for all server state; no Redux unless global UI state demands it later.
- **Layout shell:** sidebar navigation matching the Phase 1 IA from the brief.

### Navigation (Phase 1)

| Route         | Feature key gate       | Role gate         |
| ------------- | ---------------------- | ----------------- |
| `/dashboard`  | —                      | all authenticated |
| `/sale`       | `billing.create_sale`  | staff+            |
| `/inventory`  | `inventory.view`       | staff+            |
| `/categories` | `inventory.categories` | staff+            |
| `/customers`  | `customers.view`       | staff+            |
| `/discounts`  | `billing.discount`     | staff+            |
| `/reports`    | `reports.view`         | staff+            |
| `/staff`      | `users.manage`         | client admin      |
| `/settings`   | `settings.view`        | client admin      |

### Design approach

- Tailwind with a small set of design tokens (colors, spacing, typography) in `app/styles/tokens.css`.
- Large touch targets (min 44px) for POS screens.
- Keyboard shortcuts on billing screen (search focus, complete sale).
- Not a generic admin template — custom sidebar, card-based dashboard, focused billing layout.

---

## 13. Background Jobs

| Job               | Offline                                       | Cloud                          |
| ----------------- | --------------------------------------------- | ------------------------------ |
| Sync push/pull    | In-process worker, cron every 30s when online | BullMQ worker                  |
| Low-stock alerts  | `node-cron` daily                             | BullMQ scheduled               |
| Report generation | On-demand (sync)                              | BullMQ async                   |
| FBR retry         | N/A offline                                   | BullMQ with backoff            |
| Backup            | Local export cron                             | Managed PG backups + app-level |

---

## 14. Security & Non-Functional Requirements

### Security

- Password hashing: **argon2id** (preferred over bcrypt for new systems)
- JWT: short-lived access (15m) + rotating refresh tokens (7d), stored httpOnly cookie for cloud / secure local storage for Electron
- Rate limiting on `/auth/login` (5 attempts / 15 min per IP+email)
- Input validation on every endpoint via Fastify schemas
- Audit log: permission changes, voided sales, ledger edits, manual price overrides, license events
- `tenant_id` never accepted from request body — always from JWT / local config

### Scalability (cloud)

- Stateless API instances behind load balancer
- Connection pooling via PgBouncer
- Paginated list endpoints (cursor-based for large tables)
- N+1 prevention: Prisma `include` discipline, DataLoader if needed

### Observability (cloud)

- Structured JSON logging (pino — built into Fastify)
- Sentry for error tracking
- Health check: `GET /health` (DB connectivity)

### Reliability

- Sale completion never depends on printer/scanner/network
- Local backup: pg_dump to user-chosen path on schedule
- Cloud: automated PG backups + point-in-time recovery

---

## 15. Testing Strategy

**Priority:** money, stock, and ledger correctness.

| Area                                          | Approach                                                     |
| --------------------------------------------- | ------------------------------------------------------------ |
| Billing math (discounts, tax, totals)         | Unit tests, table-driven                                     |
| Stock movements                               | Integration tests with test DB                               |
| Udhaar ledger (balance, FIFO payments, aging) | Integration tests — highest priority                         |
| Permission middleware                         | Unit tests per feature key                                   |
| Sync conflict resolution                      | Unit tests per entity strategy (Step 5)                      |
| UI                                            | Manual for Phase 1; Playwright for critical flows in Phase 2 |

---

## 16. Build Order

Backend domain APIs are built first so money, stock, and ledger correctness are proven before any UI consumes them (see §15). The `/front` workspace was scaffolded in Step 1 (Vite, routing shell, placeholder pages) but **feature screens are intentionally deferred** — not an oversight.

| Step  | Scope                                                                                                   | Status       |
| ----- | ------------------------------------------------------------------------------------------------------- | ------------ |
| **1** | `ARCHITECTURE.md` + repo scaffold (`/front` shell + `/backend` + CI)                                    | Done         |
| **2** | Auth + RBAC + tenant model                                                                              | Done         |
| **3** | Billing + inventory + full udhaar ledger                                                                | Done         |
| **4** | Reporting + multi-branch                                                                                | Done         |
| **5** | Hybrid sync engine (outbox, push/pull worker, device auth, conflict APIs)                               | **Done**     |
| **—** | **Backend Phase 1** (API + ledger + inventory + branches + sync)                                        | **Complete** |
| **6** | **Frontend Phase 1** — on hold until UI brief (auth, billing POS, inventory, customers/udhaar, reports) | **On hold**  |
| **7** | Add-on modules (feature-flagged)                                                                        | Pending      |
| **8** | Mobile + hardware integrations                                                                          | Pending      |

**Frontend timing:** Step 6 is on hold. Backend Phase 1 is complete; `/front` remains a routed shell only. Cloud deployment is deferred until the full stack is ready — not part of backend Phase 1.

---

## 17. Decisions & Alternative Approaches

### 17.1 Fastify vs Express

**Decision: Fastify**

| Factor                 | Fastify                        | Express                               |
| ---------------------- | ------------------------------ | ------------------------------------- |
| JSON schema validation | Built-in (TypeBox/AJV)         | Requires manual Zod/express-validator |
| Performance            | ~2–3× throughput in benchmarks | Adequate for POS scale                |
| TypeScript             | First-class via generics       | Doable but bolted-on                  |
| Ecosystem              | Smaller but sufficient         | Larger                                |
| Learning curve         | Slightly steeper               | Familiar to most Node devs            |

For a POS where **every endpoint touches money or inventory**, built-in request/response validation is worth more than Express's larger middleware catalog. Fastify's plugin encapsulation also maps cleanly to domain modules.

**If you prefer Express:** swap is low-cost at this stage (no feature code yet). The module structure stays identical.

### 17.2 Prisma vs Alternatives

**Decision: Prisma**

- Type-safe queries catch errors at compile time — critical as schema grows.
- Migration workflow (`prisma migrate`) is excellent for keeping offline and cloud schemas identical.
- Prisma client extensions are the natural place for automatic `tenant_id` injection.
- **Downside:** complex reports (udhaar aging with FIFO) may need `$queryRaw` — acceptable.
- **Alternative Drizzle:** lighter, more SQL-like, better for raw query heavy apps. Chosen Prisma for migration UX and team familiarity.
- **Alternative TypeORM:** more decorators/magic, weaker TypeScript inference — not recommended for greenfield.

### 17.3 Where I agree vs. would flag alternatives

| Topic                    | Brief says                | My take                                                                                                                          |
| ------------------------ | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL offline       | Bundled local PG          | **Agree.** SQLite would simplify Electron but breaks "one schema everywhere" and makes sync harder. Worth the PG lifecycle cost. |
| Shared DB multi-tenancy  | `tenant_id` row isolation | **Agree** at this scale. Revisit if any tenant exceeds ~50M rows.                                                                |
| No PWA                   | React Native later        | **Agree.** PWA offline is unreliable for POS hardware access.                                                                    |
| JWT                      | Stateless auth            | **Agree** for cloud. Offline installs will also issue JWTs locally (signed with per-install secret from license).                |
| BullMQ cloud-only        | Redis dependency          | **Agree.** Redis on a shopkeeper's PC is unnecessary complexity.                                                                 |
| UUID client-side IDs     | Not in brief              | **Adding** — required for offline sync without central ID server. See §10.                                                       |
| Credit obligations table | Not in brief              | **Adding** — needed for correct aging buckets without replaying entire ledger on every report.                                   |
| Argon2 over bcrypt       | Brief says bcrypt/argon2  | **Prefer argon2id** as default; both acceptable.                                                                                 |

### 17.4 Electron backend hosting

**Decision:** Run Fastify in the Electron main process initially.

- **Pro:** Simplest packaging, shared Node runtime.
- **Con:** A backend crash could take down the window. Mitigation: wrap in try/catch + auto-restart; fork to child process in Step 5 if stability issues arise.

---

## Appendix A: Feature Key Registry (initial)

See `shared/src/features.ts` for the canonical list. Grows as modules are added.

## Appendix B: Database Schema

See [`docs/SCHEMA.md`](docs/SCHEMA.md) for full table definitions covering build steps 2–3.

## Appendix C: Environment Variables

| Variable             | Used by           | Description                             |
| -------------------- | ----------------- | --------------------------------------- |
| `DATABASE_URL`       | backend           | PostgreSQL connection string            |
| `JWT_SECRET`         | backend           | Access token signing key                |
| `JWT_REFRESH_SECRET` | backend           | Refresh token signing key               |
| `DEPLOYMENT_MODE`    | backend           | `cloud` \| `offline` \| `hybrid`        |
| `TENANT_ID`          | backend (offline) | Fixed tenant for single-tenant installs |
| `REDIS_URL`          | backend (cloud)   | BullMQ connection                       |
| `SENTRY_DSN`         | backend (cloud)   | Error tracking                          |
| `VITE_API_URL`       | front             | API base URL                            |
