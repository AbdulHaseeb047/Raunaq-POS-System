# Backend API & Feature Reference (Frontend Design Guide)

Complete reference for designing and building the POS frontend against the Phase 1 backend.  
**Base URL (dev):** `http://localhost:3001` — frontend proxy via `VITE_API_URL` (default `/api`).

**Related docs:** [ARCHITECTURE.md](../ARCHITECTURE.md) · [SCHEMA.md](./SCHEMA.md) · [shared/src/features.ts](../shared/src/features.ts)

---

## Table of contents

1. [Quick start for frontend](#1-quick-start-for-frontend)
2. [Authentication & session](#2-authentication--session)
3. [Roles, features & route gates](#3-roles-features--route-gates)
4. [Request conventions](#4-request-conventions)
5. [Errors](#5-errors)
6. [Pagination & search](#6-pagination--search)
7. [Money & dates](#7-money--dates)
8. [Screen → API mapping](#8-screen--api-mapping)
9. [Modules & endpoints](#9-modules--endpoints)
10. [Enums & status values](#10-enums--status-values)
11. [Business rules the UI must respect](#11-business-rules-the-ui-must-respect)
12. [Hybrid sync (UI contract)](#12-hybrid-sync-ui-contract)
13. [Not built yet (Phase 2+)](#13-not-built-yet-phase-2)
14. [TypeScript shared package](#14-typescript-shared-package)

---

## 1. Quick start for frontend

| Concern | Detail |
|--------|--------|
| API style | REST JSON, no GraphQL |
| Auth | Bearer JWT in `Authorization` header |
| Tenant scope | From JWT (`tenantId` on user) — **never** send tenant ID in body for client admin |
| Branch context | Optional `X-Branch-Id` header on sale-creating requests |
| State fetching | TanStack Query recommended (per ARCHITECTURE.md) |
| Feature gating | Check `user.features[]` from login/me; hide nav items without keys |
| Super Admin | Separate admin portal (not in Phase 1 front shell); uses `/tenants/*` routes |

**Health check (no auth):**

```
GET /health
```

```json
{
  "status": "ok",
  "timestamp": "2026-07-06T12:00:00.000Z",
  "database": "connected",
  "deploymentMode": "offline"
}
```

`deploymentMode`: `offline` | `hybrid` | `cloud` — drives sync banner visibility.

---

## 2. Authentication & session

### Login

```
POST /auth/login
```

**Body:**

```json
{ "email": "admin@shop.com", "password": "secret" }
```

**Response:**

```json
{
  "accessToken": "<jwt>",
  "refreshToken": "<opaque>",
  "mustChangePassword": false,
  "user": {
    "id": "uuid",
    "email": "admin@shop.com",
    "fullName": "Shop Admin",
    "role": "CLIENT_ADMIN",
    "features": ["billing.create_sale", "..."],
    "mustChangePassword": false
  }
}
```

- Rate limited: 5 attempts / 15 minutes.
- Store `refreshToken` securely; use for silent refresh.
- If `mustChangePassword: true`, block all routes except change-password, logout, refresh until password is changed.

### Refresh (token rotation)

```
POST /auth/refresh
```

**Body:** `{ "refreshToken": "..." }`  
**Response:** `{ "accessToken": "...", "refreshToken": "..." }`  
Old refresh token is revoked on use.

### Logout

```
POST /auth/logout
```

**Body:** `{ "refreshToken": "..." }`  
**Response:** `{ "success": true }`

### Change password

```
POST /auth/change-password
Authorization: Bearer <accessToken>
```

**Body:**

```json
{
  "currentPassword": "old",
  "newPassword": "newpassword8"
}
```

**Response:** New tokens + updated `user` object (same shape as login).

### Current user

```
GET /auth/me
Authorization: Bearer <accessToken>
```

**Response:**

```json
{
  "id": "uuid",
  "email": "...",
  "fullName": "...",
  "role": "STAFF",
  "tenantId": "uuid",
  "features": ["billing.create_sale", "..."],
  "mustChangePassword": false
}
```

### JWT payload (for debugging)

Access token carries: `sub` (user id), `tenantId`, `role`, `features[]`, `mustChangePassword`.  
Default access TTL: **15m**. Refresh TTL: **7d**.

---

## 3. Roles, features & route gates

### Roles

| Role | Who | Tenant in URL |
|------|-----|---------------|
| `SUPER_ADMIN` | Platform operator | Yes (`/tenants/:tenantId/...`) |
| `CLIENT_ADMIN` | Shop owner/manager | No — from JWT only |
| `STAFF` | Cashier / floor staff | No — from JWT only |

- **Super Admin** bypasses all feature checks.
- **Client Admin** has all features enabled for the tenant (no per-feature list on user).
- **Staff** only has features assigned via `PUT /users/:userId/features`.

### Feature keys (import from `@pos/shared`)

| Key | UI area |
|-----|---------|
| `billing.create_sale` | POS / new sale, sales list |
| `billing.void_sale` | Void sale action |
| `billing.discount` | Line/bill discounts, discount rules page |
| `billing.discount_unlimited` | Ignore `maxDiscountPercentStaff` cap |
| `billing.print_receipt` | Receipt print toggle (backend stores flag; printing is client-side) |
| `inventory.view` | Products list, barcode lookup |
| `inventory.edit` | Create/update products |
| `inventory.categories` | Categories page |
| `inventory.stock_adjust` | Stock adjustment modal |
| `customers.view` | Customers list/detail |
| `customers.edit` | Create/update customers |
| `customers.ledger_view` | Udhaar ledger tab |
| `customers.ledger_record` | Record payment |
| `customers.ledger_edit` | Void ledger payment |
| `reports.view` | Dashboard stats, daily sales, udhaar aging |
| `reports.analytics_dashboard` | Reserved for richer analytics (Phase 2) |
| `users.manage` | Staff management page |
| `settings.view` | Settings page (read) |
| `settings.edit` | Settings page (write) |
| `multi_branch.access` | Branch list/create, branch switcher |
| `delivery.*`, `fbr.integration` | Not implemented in Phase 1 |

### Feature registry (for admin UIs)

```
GET /features
Authorization: Bearer <token>
```

Returns all active features from DB:

```json
[
  {
    "key": "billing.create_sale",
    "module": "billing",
    "label": "Create Sale",
    "description": "..."
  }
]
```

### Frontend route gates (Phase 1 shell)

| Route | Feature | Role |
|-------|---------|------|
| `/` (dashboard) | — | any authenticated |
| `/sale` | `billing.create_sale` | staff+ |
| `/inventory` | `inventory.view` | staff+ |
| `/categories` | `inventory.categories` | staff+ |
| `/customers` | `customers.view` | staff+ |
| `/discounts` | `billing.discount` | staff+ |
| `/reports` | `reports.view` | staff+ |
| `/staff` | `users.manage` | client admin |
| `/settings` | `settings.view` | client admin |

Add a **sync issues** screen or banner when `deploymentMode === 'hybrid'` (see [§12](#12-hybrid-sync-ui-contract)).

---

## 4. Request conventions

### Headers

| Header | When | Value |
|--------|------|-------|
| `Authorization` | All protected routes | `Bearer <accessToken>` |
| `Content-Type` | POST/PATCH/PUT | `application/json` |
| `X-Branch-Id` | Creating sales (and any branch-scoped write) | UUID of active branch |

### Branch resolution (`X-Branch-Id`)

1. If header present → validate branch belongs to tenant and is active.
2. If absent → use tenant **default branch**.
3. **Staff** may only use their assigned `user.branchId` (or default if unset).
4. **Client Admin** may use any active branch in the tenant.

Frontend should:

- Load branches via `GET /branches` when user has `multi_branch.access`.
- Persist selected branch in local state; send `X-Branch-Id` on `POST /sales`.
- For staff without multi-branch feature, do not show branch switcher (backend enforces their branch).

### Stock scope

**Inventory is tenant-wide** — `products.stock_quantity` is shared across branches.  
`branch_id` on sales and stock movements is for **reporting only**, not separate stock pools.

### Sale numbers

Format `S-000001`, **tenant-wide** sequence (not per branch).

---

## 5. Errors

All application errors return JSON:

```json
{
  "statusCode": 400,
  "error": "AppError",
  "message": "Human-readable message",
  "code": "VALIDATION_ERROR",
  "details": {}
}
```

| HTTP | Code | When |
|------|------|------|
| 400 | `VALIDATION_ERROR` | Zod validation; `details` has field errors |
| 401 | `UNAUTHORIZED` | Missing/invalid token |
| 403 | `FORBIDDEN` | Role/feature/branch denied |
| 403 | `PASSWORD_CHANGE_REQUIRED` | Must change password first |
| 404 | `NOT_FOUND` | Entity missing |
| 409 | `CONFLICT` | Duplicate slug, already voided, etc. |
| 500 | — | Unexpected server error |

Frontend: surface `message`; use `code` for branching (e.g. force password-change modal).

---

## 6. Pagination & search

### Paginated list shape

```json
{
  "data": [ /* items */ ],
  "meta": {
    "total": 120,
    "page": 1,
    "pageSize": 50,
    "totalPages": 3
  }
}
```

### Query params

| Param | Used on | Default |
|-------|---------|---------|
| `page` | users, customers, products, sales, tenants | 1 |
| `pageSize` | same | 20 (users/sales/tenants) or 50 (customers/products) |
| `search` | customers, products | — |
| `branchId` | reports only | optional filter |
| `date` | daily sales report | today (ISO date `YYYY-MM-DD`) |

---

## 7. Money & dates

- **Amounts in API responses are strings** with 2 decimal places (e.g. `"1250.00"`).
- **Amounts in request bodies are numbers** (e.g. `1250` or `1250.5`).
- **Stock quantities** use 3 decimal places in responses (e.g. `"10.000"`).
- **Timestamps** are ISO 8601 UTC strings.

---

## 8. Screen → API mapping

### Dashboard (`/`)

| Widget | API |
|--------|-----|
| Today's sales total | `GET /reports/dashboard` → `todaySalesTotal` |
| Transaction count | → `todayTransactionCount` |
| Low stock alerts | → `lowStockAlerts[]` |
| Outstanding udhaar | → `outstandingUdhaar` |
| Branch filter (optional) | `?branchId=<uuid>` |
| Sync banner (hybrid) | `GET /sync/status` |

### New Sale (`/sale`)

| Action | API |
|--------|-----|
| Product search / scan | `GET /products?search=` or `GET /products/barcode/:barcode` |
| Customer picker | `GET /customers?search=` |
| Active discounts (optional) | `GET /discounts` |
| Staff discount cap | `GET /settings` → `maxDiscountPercentStaff` |
| Complete sale | `POST /sales` + `X-Branch-Id` |
| Recent sales sidebar | `GET /sales?page=1&pageSize=20` |
| Void sale | `POST /sales/:saleId/void` |

### Inventory (`/inventory`)

| Action | API |
|--------|-----|
| List | `GET /products` |
| Create / edit | `POST /products`, `PATCH /products/:id` |
| Stock adjust | `POST /products/:id/stock` |

### Categories (`/categories`)

| Action | API |
|--------|-----|
| List | `GET /categories` |
| Create / edit | `POST /categories`, `PATCH /categories/:id` |

### Customers (`/customers`)

| Action | API |
|--------|-----|
| List / search | `GET /customers` |
| Detail | `GET /customers/:id` |
| Create / edit | `POST /customers`, `PATCH /customers/:id` |
| Ledger | `GET /customers/:id/ledger` |
| Record payment | `POST /customers/:id/payments` |
| Void payment | `POST /customers/:id/ledger/:entryId/void` |

### Discounts (`/discounts`)

| Action | API |
|--------|-----|
| List | `GET /discounts` |
| Create / edit | `POST /discounts`, `PATCH /discounts/:id` |

### Reports (`/reports`)

| Report | API |
|--------|-----|
| Dashboard summary | `GET /reports/dashboard` |
| Daily sales | `GET /reports/daily-sales?date=YYYY-MM-DD` |
| Udhaar aging | `GET /reports/udhaar-aging` |

### Staff (`/staff`) — Client Admin only

| Action | API |
|--------|-----|
| List staff | `GET /users` |
| Create staff | `POST /users` (always creates `STAFF` role) |
| Update | `PATCH /users/:userId` |
| Assign features | `PUT /users/:userId/features` |
| Branch assignment | `branchId` on create/update |

### Settings (`/settings`) — Client Admin

| Action | API |
|--------|-----|
| Load | `GET /settings` |
| Save | `PATCH /settings` |
| Branches (if licensed) | `GET/POST/PATCH /branches` |
| Register sync device (hybrid setup) | `POST /sync/devices` |

---

## 9. Modules & endpoints

### Auth

| Method | Path | Auth | Body / query | Response |
|--------|------|------|--------------|----------|
| POST | `/auth/login` | — | `email`, `password` | tokens + user |
| POST | `/auth/refresh` | — | `refreshToken` | tokens |
| POST | `/auth/logout` | — | `refreshToken` | `{ success }` |
| POST | `/auth/change-password` | ✓ | `currentPassword`, `newPassword` (min 8) | tokens + user |
| GET | `/auth/me` | ✓ | — | user + tenantId |

---

### Billing & sales

**Feature:** `billing.create_sale` (list/create), `billing.void_sale` (void), `billing.discount` (discounts)

#### List sales

```
GET /sales?page=1&pageSize=20
```

```json
{
  "data": [
    {
      "id": "uuid",
      "saleNumber": "S-000042",
      "grandTotal": "1500.00",
      "paymentStatus": "PAID",
      "createdAt": "2026-07-06T10:30:00.000Z",
      "customer": { "id": "uuid", "name": "Ali" }
    }
  ],
  "meta": { "total": 42, "page": 1, "pageSize": 20, "totalPages": 3 }
}
```

#### Create sale

```
POST /sales
X-Branch-Id: <optional>
```

**Body:**

```json
{
  "customerId": "uuid",
  "paymentMethod": "CASH",
  "items": [
    {
      "productId": "uuid",
      "quantity": 2,
      "unitPrice": 500,
      "discountAmount": 0
    }
  ],
  "billDiscountAmount": 0,
  "notes": "optional",
  "printReceipt": true
}
```

| Field | Rules |
|-------|-------|
| `paymentMethod` | `CASH` \| `CARD` \| `BANK_TRANSFER` \| `CREDIT` |
| `customerId` | **Required** when `paymentMethod` is `CREDIT` |
| `items` | Min 1; `productId` must be active; stock decremented if `trackStock` |
| `unitPrice` | Optional; defaults to product `sellPrice` |
| Discounts | Require `billing.discount`; capped by settings unless `billing.discount_unlimited` |

**Response:**

```json
{
  "sale": {
    "id": "uuid",
    "saleNumber": "S-000043",
    "grandTotal": "1000.00",
    "paymentStatus": "PAID",
    "createdAt": "2026-07-06T11:00:00.000Z"
  },
  "printReceipt": true,
  "creditLimitWarning": "Customer balance (5500.00) exceeds credit limit (5000.00)"
}
```

`creditLimitWarning` is optional — sale still completes; show as non-blocking warning.

#### Void sale

```
POST /sales/:saleId/void
```

**Body:** `{ "reason": "Wrong items" }` (required)

**Response:** `{ "success": true }`

- Restores stock, reverses credit ledger if applicable.
- Cannot void twice.

#### Discount rules

```
GET    /discounts
POST   /discounts
PATCH  /discounts/:id
```

**Create body:**

```json
{
  "name": "10% off rice",
  "discountType": "PERCENTAGE",
  "value": 10,
  "appliesTo": "ITEM",
  "productId": "uuid",
  "categoryId": null,
  "minBillAmount": null,
  "isActive": true
}
```

| Field | Values |
|-------|--------|
| `discountType` | `PERCENTAGE` \| `FLAT` |
| `appliesTo` | `ITEM` \| `BILL` |

**Response item:**

```json
{
  "id": "uuid",
  "name": "10% off rice",
  "discountType": "PERCENTAGE",
  "value": "10.00",
  "appliesTo": "ITEM",
  "productId": "uuid",
  "categoryId": null,
  "minBillAmount": null,
  "isActive": true
}
```

> Note: Sale creation accepts manual `discountAmount` on lines / bill; discount **rules** are stored for future auto-apply or admin reference — verify product behavior when wiring POS.

---

### Inventory

#### Categories

**Feature:** `inventory.categories`

```
GET    /categories
POST   /categories
PATCH  /categories/:id
```

**Body (create):** `{ "name": "Groceries", "sortOrder": 0, "isActive": true }`

#### Products

**Feature:** `inventory.view` (read), `inventory.edit` (write), `inventory.stock_adjust` (stock)

```
GET  /products?search=&page=1&pageSize=50
GET  /products/barcode/:barcode
POST /products
PATCH /products/:id
POST /products/:id/stock
```

**Create/update body:**

```json
{
  "name": "Basmati Rice 5kg",
  "categoryId": "uuid",
  "sku": "RICE-5K",
  "barcode": "8901234567890",
  "unit": "pcs",
  "costPrice": 800,
  "sellPrice": 950,
  "taxRate": 0,
  "lowStockThreshold": 10,
  "trackStock": true,
  "isActive": true
}
```

**Product list item:**

```json
{
  "id": "uuid",
  "name": "Basmati Rice 5kg",
  "sku": "RICE-5K",
  "barcode": "8901234567890",
  "unit": "pcs",
  "sellPrice": "950.00",
  "stockQuantity": "25.000",
  "lowStockThreshold": "10.000",
  "taxRate": "0.00",
  "trackStock": true,
  "isActive": true,
  "category": { "id": "uuid", "name": "Groceries" }
}
```

**Stock adjust body:**

```json
{
  "quantityDelta": 5,
  "movementType": "STOCK_IN",
  "notes": "Delivery from supplier"
}
```

`movementType`: `STOCK_IN` | `STOCK_OUT` | `ADJUSTMENT`  
`quantityDelta`: positive or negative number.

---

### Customers & Udhaar

#### Customers

**Feature:** `customers.view` / `customers.edit`

```
GET   /customers?search=&page=1&pageSize=50
GET   /customers/:id
POST  /customers
PATCH /customers/:id
```

**Body:**

```json
{
  "name": "Ahmed Khan",
  "phone": "03001234567",
  "email": null,
  "address": "Street 5",
  "creditLimit": 50000,
  "notes": "",
  "isActive": true
}
```

**Customer object:**

```json
{
  "id": "uuid",
  "name": "Ahmed Khan",
  "phone": "03001234567",
  "email": null,
  "address": "Street 5",
  "creditLimit": "50000.00",
  "balance": "2500.00",
  "notes": "",
  "isActive": true
}
```

`balance` = outstanding udhaar (positive means customer owes).

#### Ledger

**Feature:** `customers.ledger_view` / `customers.ledger_record` / `customers.ledger_edit`

```
GET  /customers/:id/ledger
POST /customers/:id/payments
POST /customers/:id/ledger/:entryId/void
```

**Record payment body:**

```json
{
  "amount": 500,
  "paymentMethod": "cash",
  "notes": "Partial payment"
}
```

`paymentMethod`: `cash` | `card` | `bank_transfer` (lowercase in API).

**Ledger entry:**

```json
{
  "id": "uuid",
  "entryType": "CREDIT_SALE",
  "amount": "250.00",
  "balanceAfter": "250.00",
  "paymentMethod": null,
  "notes": null,
  "voidedAt": null,
  "recordedBy": { "id": "uuid", "fullName": "Cashier" },
  "createdAt": "2026-07-06T09:00:00.000Z"
}
```

**Void ledger entry body:** `{ "reason": "..." }`  
- Void **payments** via ledger void endpoint.  
- Void **credit sales** only via `POST /sales/:id/void`.

---

### Reports

**Feature:** `reports.view`

#### Dashboard

```
GET /reports/dashboard?branchId=<optional>
```

```json
{
  "todaySalesTotal": "45000.00",
  "todayTransactionCount": 38,
  "lowStockAlerts": [
    {
      "id": "uuid",
      "name": "Cooking Oil",
      "stockQuantity": "3.000",
      "lowStockThreshold": "5.000"
    }
  ],
  "outstandingUdhaar": "125000.00"
}
```

#### Daily sales

```
GET /reports/daily-sales?date=2026-07-06&branchId=<optional>
```

```json
{
  "date": "2026-07-06",
  "total": "45000.00",
  "transactionCount": 38,
  "sales": [
    {
      "id": "uuid",
      "saleNumber": "S-000001",
      "grandTotal": "1200.00",
      "paymentStatus": "PAID",
      "customerName": "Walk-in",
      "createdAt": "2026-07-06T08:15:00.000Z"
    }
  ]
}
```

#### Udhaar aging

```
GET /reports/udhaar-aging
```

```json
[
  {
    "customerId": "uuid",
    "name": "Ahmed Khan",
    "phone": "03001234567",
    "bucket0_7": "500.00",
    "bucket8_30": "1200.00",
    "bucket30_plus": "800.00",
    "total": "2500.00"
  }
]
```

Buckets are days since obligation opened (FIFO credit tracking).

---

### Settings

**Feature:** `settings.view` / `settings.edit`

```
GET   /settings
PATCH /settings
```

**Settings object:**

```json
{
  "tenantId": "uuid",
  "businessName": "My Shop",
  "address": "Main Bazaar",
  "phone": "042-1234567",
  "logoUrl": null,
  "currency": "PKR",
  "taxLabel": "GST",
  "defaultTaxRate": "0.00",
  "printReceiptsDefault": true,
  "receiptFooter": "Thank you!",
  "maxDiscountPercentStaff": "10.00"
}
```

**Patch:** any subset of `businessName`, `address`, `phone`, `logoUrl`, `currency` (3 chars), `taxLabel`, `defaultTaxRate`, `printReceiptsDefault`, `receiptFooter`, `maxDiscountPercentStaff`.

---

### Branches

**Feature:** `multi_branch.access`

```
GET   /branches
POST  /branches
PATCH /branches/:branchId
```

**Branch object:**

```json
{
  "id": "uuid",
  "name": "Main Store",
  "code": "MAIN",
  "address": null,
  "phone": null,
  "isDefault": true,
  "isActive": true
}
```

**Create body:** `{ "name", "code", "address?", "phone?", "isActive?" }`  
`code`: alphanumeric, stored uppercase.

---

### Users (Client Admin)

**Feature:** `users.manage` + role `CLIENT_ADMIN`

```
GET   /users?page=1&pageSize=20
POST  /users
PATCH /users/:userId
PUT   /users/:userId/features
```

**Create staff body:**

```json
{
  "email": "cashier@shop.com",
  "password": "password12",
  "fullName": "Sara Ahmed",
  "branchId": "uuid",
  "featureKeys": ["billing.create_sale", "inventory.view"]
}
```

> `POST /users` from client admin **always creates STAFF** (role in body is ignored).

**Update body:** `{ "fullName?", "isActive?", "branchId?" }`

**Set features body:** `{ "featureKeys": ["billing.create_sale", "..."] }`

**User list item:**

```json
{
  "id": "uuid",
  "email": "cashier@shop.com",
  "fullName": "Sara Ahmed",
  "role": "STAFF",
  "isActive": true,
  "features": ["billing.create_sale"],
  "branchId": "uuid",
  "lastLoginAt": "2026-07-05T18:00:00.000Z",
  "createdAt": "2026-06-01T00:00:00.000Z"
}
```

---

### Tenants & users (Super Admin only)

**Role:** `SUPER_ADMIN`

```
GET   /tenants?page=1&pageSize=20
GET   /tenants/:tenantId
POST  /tenants
PATCH /tenants/:tenantId
PUT   /tenants/:tenantId/features

GET   /tenants/:tenantId/users
POST  /tenants/:tenantId/users
PATCH /tenants/:tenantId/users/:userId
PUT   /tenants/:tenantId/users/:userId/features
```

**Create tenant body:**

```json
{
  "name": "New Shop",
  "slug": "new-shop",
  "tier": "STANDARD",
  "adminEmail": "owner@newshop.com",
  "adminPassword": "password12",
  "adminFullName": "Owner Name"
}
```

`tier`: `STARTER` | `STANDARD` | `PRO` | `ENTERPRISE` — applies feature preset.

**Tenant detail:**

```json
{
  "id": "uuid",
  "name": "New Shop",
  "slug": "new-shop",
  "tier": "STANDARD",
  "isActive": true,
  "features": ["billing.create_sale", "..."],
  "createdAt": "...",
  "updatedAt": "..."
}
```

Super admin `POST /tenants/:tenantId/users` can set `role` to `STAFF` or `CLIENT_ADMIN`.

---

### Sync (hybrid mode)

Available when `DEPLOYMENT_MODE=hybrid`. User-facing endpoints use normal JWT auth.

| Method | Path | Who | Purpose |
|--------|------|-----|---------|
| GET | `/sync/status` | all authenticated | Banner / health |
| GET | `/sync/outbox/issues` | all authenticated | Conflict/failed list |
| POST | `/sync/outbox/:outboxId/retry` | client admin | Re-queue entry |
| POST | `/sync/outbox/:outboxId/dismiss` | client admin | Accept cloud version |
| POST | `/sync/run` | all authenticated | Manual sync cycle |
| POST | `/sync/devices` | client admin | Register device + get API key |

#### Sync status

```
GET /sync/status
```

```json
{
  "deploymentMode": "hybrid",
  "pendingChanges": 3,
  "conflictChanges": 0,
  "failedChanges": 1,
  "status": "failed",
  "userMessage": "1 change(s) failed to sync; they will retry...",
  "workerRunning": true,
  "workerConfigured": true,
  "lastPushedAt": "2026-07-06T11:55:00.000Z",
  "lastPulledAt": "2026-07-06T11:55:30.000Z",
  "cloudCursor": "uuid"
}
```

`status`: `synced` | `pending` | `conflict` | `failed` (priority: conflict > failed > pending).

#### Outbox issues

```
GET /sync/outbox/issues
```

```json
{
  "data": [
    {
      "id": "uuid",
      "tableName": "products",
      "recordId": "uuid",
      "operation": "UPDATE",
      "status": "CONFLICT",
      "errorMessage": "...",
      "retryCount": 5,
      "createdAt": "...",
      "syncedAt": null
    }
  ]
}
```

#### Retry

```
POST /sync/outbox/:outboxId/retry
```

Response: `{ "id": "uuid", "status": "PENDING" }`

#### Dismiss (accept remote)

```
POST /sync/outbox/:outboxId/dismiss
```

**Body:** `{ "reason": "Keep cloud price" }`

Response: `{ "id": "uuid", "status": "SYNCED", "reconcile": "applied_remote" }`

Dismiss fetches authoritative record from cloud, reconciles local DB, then marks outbox synced.

#### Register sync device (setup wizard)

```
POST /sync/devices
```

**Body:** `{ "deviceId": "lane-1-pc", "label": "Counter 1" }`

**Response:** `{ "deviceId": "lane-1-pc", "apiKey": "<shown once>" }`  
Store API key in local `.env` as `SYNC_API_KEY` on hybrid node — not in browser.

#### Manual sync

```
POST /sync/run
```

Response when online:

```json
{
  "online": true,
  "push": { "pushed": 2, "failed": 0 },
  "pull": { "applied": 1, "skipped": 0 }
}
```

---

## 10. Enums & status values

### Payment methods (sales)

`CASH` | `CARD` | `BANK_TRANSFER` | `CREDIT`

### Payment methods (udhaar payments)

`cash` | `card` | `bank_transfer` (lowercase)

### Sale `paymentStatus`

`PAID` | `PARTIAL` | `UNPAID` (credit sales may be `UNPAID` until settled)

### Sale `status` (internal; list filters `COMPLETED` only)

`COMPLETED` | `VOIDED`

### Ledger `entryType`

| Type | Meaning |
|------|---------|
| `CREDIT_SALE` | Udhaar charge from sale |
| `PAYMENT` | Customer payment (negative amount) |
| `VOID_REVERSAL` | System reversal row |

### Stock `movementType`

`STOCK_IN` | `STOCK_OUT` | `ADJUSTMENT`

### Sync outbox `status`

`PENDING` | `SYNCED` | `FAILED` | `CONFLICT`

### Sync outbox `operation`

`INSERT` | `UPDATE` | `DELETE`

### Tenant `tier`

`STARTER` | `STANDARD` | `PRO` | `ENTERPRISE`

---

## 11. Business rules the UI must respect

### Billing

1. **Credit sales** require a customer; show customer picker before allowing `CREDIT`.
2. **Stock** — block or warn when `quantity > stockQuantity` for tracked products (backend rejects insufficient stock).
3. **Discounts** — hide discount inputs unless user has `billing.discount`; show cap from settings unless `billing.discount_unlimited`.
4. **Void** — require reason text; confirm dialog; hide if no `billing.void_sale`.
5. **Receipt** — `printReceipt` in create body is a hint; actual printing is frontend responsibility (`billing.print_receipt` for permission).

### Udhaar

1. **Balance** on customer card = amount owed to shop.
2. **Payments** reduce balance; allocations are FIFO (oldest credit first) — no UI control needed.
3. **Credit limit warning** on sale is informational only.
4. **Void payment** — only via ledger void; cannot void if newer payments exist.
5. **Void credit sale** — only via sale void, not ledger void.

### Inventory

1. One stock pool per tenant — no per-branch stock UI.
2. Barcode scan URL-encodes barcode string.
3. Soft-deleted products excluded from lists.

### Auth UX

1. If `PASSWORD_CHANGE_REQUIRED`, redirect to change-password screen.
2. On 401, attempt refresh once; then logout.
3. Login returns `features` but prefer `GET /auth/me` on app load for fresh list.

### Branches

1. Staff: no branch picker unless their role allows (they're locked to assigned branch).
2. Client admin with `multi_branch.access`: show branch switcher; persist selection; send `X-Branch-Id` on sales.

---

## 12. Hybrid sync UI contract

Recommended UX for hybrid deployments:

```
┌─────────────────────────────────────────────────────────┐
│  ⚠ 3 changes waiting to sync          [View] [Sync now] │  ← GET /sync/status
└─────────────────────────────────────────────────────────┘
```

| `status` | Color / icon | Actions |
|----------|--------------|---------|
| `synced` | hidden or green dot | — |
| `pending` | amber | optional "Sync now" → `POST /sync/run` |
| `failed` | orange | link to issues |
| `conflict` | red | link to issues — needs admin |

**Issues screen** (client admin):

- List from `GET /sync/outbox/issues`
- Per row: table name, operation, error, **Retry** (`POST .../retry`), **Dismiss** (`POST .../dismiss` + reason modal)
- Staff see banner message but cannot retry/dismiss (403)

**Polling:** `GET /sync/status` every 30–60s on hybrid, or after writes.

---

## 13. Not built yet (Phase 2+)

| Area | Notes |
|------|-------|
| Delivery module | Feature keys exist; no routes |
| FBR integration | Feature key only |
| Receipt PDF/thermal | `printReceipt` flag only; no server-side render |
| Sale detail endpoint | No `GET /sales/:id` — use list or add later |
| Product delete | Soft delete via PATCH `isActive: false` only |
| Customer delete | Soft delete not exposed in routes |
| File upload (logo) | `logoUrl` is string URL; no upload endpoint |
| WebSockets | No real-time; poll sync status |
| Super Admin UI | Routes exist; no frontend shell |
| `reports.analytics_dashboard` | Key reserved; same as dashboard for now |

---

## 14. TypeScript shared package

Import constants and types from `@pos/shared`:

```typescript
import { FEATURES, USER_ROLES, TENANT_TIERS, DEPLOYMENT_MODES } from '@pos/shared';
import type { FeatureKey, UserRole, TenantTier, DeploymentMode } from '@pos/shared';
```

Use the same feature strings in frontend route guards as the backend middleware.

**Suggested frontend modules:**

```
front/src/
  lib/api.ts          — fetch wrapper + auth header injection
  lib/auth.ts         — token storage, refresh, me loader
  lib/features.ts     — re-export FEATURES + hasFeature(user, key)
  features/billing/   — sale screen, hooks
  features/customers/
  ...
```

---

## Appendix: endpoint index

| Method | Path |
|--------|------|
| GET | `/health` |
| POST | `/auth/login` |
| POST | `/auth/refresh` |
| POST | `/auth/logout` |
| POST | `/auth/change-password` |
| GET | `/auth/me` |
| GET | `/features` |
| GET | `/tenants` |
| GET | `/tenants/:tenantId` |
| POST | `/tenants` |
| PATCH | `/tenants/:tenantId` |
| PUT | `/tenants/:tenantId/features` |
| GET | `/tenants/:tenantId/users` |
| POST | `/tenants/:tenantId/users` |
| PATCH | `/tenants/:tenantId/users/:userId` |
| PUT | `/tenants/:tenantId/users/:userId/features` |
| GET | `/users` |
| POST | `/users` |
| PATCH | `/users/:userId` |
| PUT | `/users/:userId/features` |
| GET | `/categories` |
| POST | `/categories` |
| PATCH | `/categories/:id` |
| GET | `/products` |
| GET | `/products/barcode/:barcode` |
| POST | `/products` |
| PATCH | `/products/:id` |
| POST | `/products/:id/stock` |
| GET | `/sales` |
| POST | `/sales` |
| POST | `/sales/:saleId/void` |
| GET | `/discounts` |
| POST | `/discounts` |
| PATCH | `/discounts/:id` |
| GET | `/customers` |
| GET | `/customers/:id` |
| POST | `/customers` |
| PATCH | `/customers/:id` |
| GET | `/customers/:id/ledger` |
| POST | `/customers/:id/payments` |
| POST | `/customers/:id/ledger/:entryId/void` |
| GET | `/settings` |
| PATCH | `/settings` |
| GET | `/branches` |
| POST | `/branches` |
| PATCH | `/branches/:branchId` |
| GET | `/reports/dashboard` |
| GET | `/reports/daily-sales` |
| GET | `/reports/udhaar-aging` |
| GET | `/sync/status` |
| GET | `/sync/outbox/issues` |
| POST | `/sync/outbox/:outboxId/retry` |
| POST | `/sync/outbox/:outboxId/dismiss` |
| POST | `/sync/run` |
| POST | `/sync/devices` |

*Cloud-only sync routes (`/sync/ingest`, `/sync/changes`, `/sync/records/...`) use device API keys — not called from browser.*

---

*Generated from backend Phase 1 implementation. Update this doc when new routes are added.*
