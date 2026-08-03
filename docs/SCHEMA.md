# Database Schema — Build Steps 2 & 3

> Covers: Auth, RBAC, tenant model, inventory, billing, discounts, and the full udhaar ledger.  
> Sync-ready columns included (used in Step 5).  
> ORM: Prisma. Database: PostgreSQL.

---

## Entity Relationship Overview

```
tenants ─────────────────────────────────────────────────────────┐
   │                                                              │
   ├── users ── staff_features                                    │
   ├── tenant_features                                            │
   ├── license_activations                                        │
   ├── categories                                                 │
   ├── products ── stock_movements                                │
   ├── customers ──┬── customer_ledger_entries                    │
   │               └── customer_credit_obligations                │
   ├── discount_rules                                             │
   ├── sales ──┬── sale_items                                     │
   │           └── sale_payments                                  │
   ├── business_settings                                          │
   ├── audit_log                                                 │
   └── sync_outbox (hybrid only; created now, used Step 5)       │
```

---

## Conventions

| Rule          | Detail                                                            |
| ------------- | ----------------------------------------------------------------- |
| Primary keys  | `UUID` — client-generated for offline idempotency                 |
| Money         | `DECIMAL(12, 2)` — never float                                    |
| Timestamps    | `TIMESTAMPTZ` — always UTC in DB, local in UI                     |
| Soft delete   | `deleted_at TIMESTAMPTZ NULL` on business entities                |
| Tenancy       | `tenant_id UUID NOT NULL` on every business table                 |
| Sync (Step 5) | `version INT NOT NULL DEFAULT 1`, `updated_at` on syncable tables |
| Indexes       | `tenant_id` on every table; composites on query hot paths         |

---

## 1. Tenancy & Auth

### `tenants`

The business account. One row per cloud tenant; one row per offline install.

| Column       | Type                | Notes                                      |
| ------------ | ------------------- | ------------------------------------------ |
| `id`         | UUID PK             |                                            |
| `name`       | VARCHAR(255)        | Business display name                      |
| `slug`       | VARCHAR(100) UNIQUE | URL-safe identifier (cloud)                |
| `tier`       | ENUM                | `STARTER`, `STANDARD`, `PRO` — plan preset |
| `is_active`  | BOOLEAN             | Soft disable                               |
| `created_at` | TIMESTAMPTZ         |                                            |
| `updated_at` | TIMESTAMPTZ         |                                            |
| `deleted_at` | TIMESTAMPTZ NULL    |                                            |

### `users`

All human accounts: Super Admin, Client Admin, Staff.

| Column                 | Type                   | Notes                                                         |
| ---------------------- | ---------------------- | ------------------------------------------------------------- |
| `id`                   | UUID PK                |                                                               |
| `tenant_id`            | UUID FK → tenants NULL | NULL for Super Admin only                                     |
| `email`                | VARCHAR(255)           | Unique per tenant (composite unique)                          |
| `password_hash`        | VARCHAR(255)           | argon2id                                                      |
| `full_name`            | VARCHAR(255)           |                                                               |
| `role`                 | ENUM                   | `SUPER_ADMIN`, `CLIENT_ADMIN`, `STAFF`                        |
| `is_active`            | BOOLEAN                |                                                               |
| `last_login_at`        | TIMESTAMPTZ NULL       |                                                               |
| `must_change_password` | BOOLEAN DEFAULT false  | Force password change on next login (seeded/offline defaults) |
| `created_at`           | TIMESTAMPTZ            |                                                               |
| `updated_at`           | TIMESTAMPTZ            |                                                               |
| `deleted_at`           | TIMESTAMPTZ NULL       |                                                               |

**Indexes:**

- `(tenant_id, email)` UNIQUE WHERE `tenant_id IS NOT NULL AND deleted_at IS NULL` — staff and client admins within a tenant
- `(email)` UNIQUE WHERE `tenant_id IS NULL AND deleted_at IS NULL` — Super Admin accounts only

> **Why two partial uniques?** PostgreSQL treats `NULL ≠ NULL`, so a composite `UNIQUE(tenant_id, email)` does **not** prevent duplicate Super Admin emails when `tenant_id` is NULL. The partial index on `email` alone closes that gap.

```sql
CREATE UNIQUE INDEX users_tenant_email_key
  ON users (tenant_id, email)
  WHERE tenant_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX users_super_admin_email_key
  ON users (email)
  WHERE tenant_id IS NULL AND deleted_at IS NULL;
```

### `refresh_tokens`

| Column       | Type             | Notes                |
| ------------ | ---------------- | -------------------- |
| `id`         | UUID PK          |                      |
| `user_id`    | UUID FK → users  |                      |
| `token_hash` | VARCHAR(255)     | Hashed refresh token |
| `expires_at` | TIMESTAMPTZ      |                      |
| `revoked_at` | TIMESTAMPTZ NULL |                      |
| `created_at` | TIMESTAMPTZ      |                      |

---

## 2. Permissions & Feature Flags

### `feature_registry`

Canonical list of feature keys. Seeded at deploy; not tenant-specific.

| Column        | Type            | Notes                               |
| ------------- | --------------- | ----------------------------------- |
| `key`         | VARCHAR(100) PK | e.g. `billing.create_sale`          |
| `module`      | VARCHAR(50)     | Grouping: `billing`, `customers`, … |
| `label`       | VARCHAR(255)    | Human-readable name                 |
| `description` | TEXT NULL       |                                     |
| `is_active`   | BOOLEAN         | Can disable deprecated features     |

### `tenant_features`

Features enabled for a tenant (package / license).

| Column        | Type                               | Notes                   |
| ------------- | ---------------------------------- | ----------------------- |
| `tenant_id`   | UUID FK → tenants                  |                         |
| `feature_key` | VARCHAR(100) FK → feature_registry |                         |
| `enabled_at`  | TIMESTAMPTZ                        |                         |
| `enabled_by`  | UUID FK → users NULL               | Super Admin who enabled |

**PK:** `(tenant_id, feature_key)`

### `staff_features`

Features granted to an individual staff user (subset of tenant features).

| Column        | Type                               | Notes        |
| ------------- | ---------------------------------- | ------------ |
| `user_id`     | UUID FK → users                    |              |
| `feature_key` | VARCHAR(100) FK → feature_registry |              |
| `granted_at`  | TIMESTAMPTZ                        |              |
| `granted_by`  | UUID FK → users                    | Client Admin |

**PK:** `(user_id, feature_key)`

### `tier_presets`

Maps tier name to default feature set. Used when creating tenant or applying preset.

| Column        | Type                               | Notes                        |
| ------------- | ---------------------------------- | ---------------------------- |
| `tier`        | ENUM PK                            | `STARTER`, `STANDARD`, `PRO` |
| `feature_key` | VARCHAR(100) FK → feature_registry |                              |

**PK:** `(tier, feature_key)`

### `license_activations`

Offline license validation records.

| Column                 | Type              | Notes                           |
| ---------------------- | ----------------- | ------------------------------- |
| `id`                   | UUID PK           |                                 |
| `tenant_id`            | UUID FK → tenants |                                 |
| `license_key_hash`     | VARCHAR(255)      | Hashed key                      |
| `hardware_fingerprint` | VARCHAR(255)      | Machine ID                      |
| `features_snapshot`    | JSONB             | Feature keys at activation time |
| `activated_at`         | TIMESTAMPTZ       |                                 |
| `last_validated_at`    | TIMESTAMPTZ NULL  | Last online check               |
| `expires_at`           | TIMESTAMPTZ NULL  | NULL = perpetual                |

---

## 3. Inventory

### `categories`

| Column       | Type              | Notes                   |
| ------------ | ----------------- | ----------------------- |
| `id`         | UUID PK           |                         |
| `tenant_id`  | UUID FK → tenants |                         |
| `name`       | VARCHAR(255)      |                         |
| `sort_order` | INT DEFAULT 0     | Sidebar / grid ordering |
| `is_active`  | BOOLEAN           |                         |
| `created_at` | TIMESTAMPTZ       |                         |
| `updated_at` | TIMESTAMPTZ       |                         |
| `deleted_at` | TIMESTAMPTZ NULL  |                         |
| `version`    | INT DEFAULT 1     | Sync                    |

**Indexes:** `(tenant_id, name)` WHERE deleted_at IS NULL

### `products`

| Column                | Type                      | Notes                      |
| --------------------- | ------------------------- | -------------------------- |
| `id`                  | UUID PK                   |                            |
| `tenant_id`           | UUID FK → tenants         |                            |
| `category_id`         | UUID FK → categories NULL |                            |
| `name`                | VARCHAR(255)              |                            |
| `sku`                 | VARCHAR(100) NULL         | Internal SKU               |
| `barcode`             | VARCHAR(100) NULL         | EAN/UPC/custom             |
| `unit`                | VARCHAR(50)               | `piece`, `kg`, `liter`, …  |
| `cost_price`          | DECIMAL(12,2) NULL        | Purchase cost              |
| `sell_price`          | DECIMAL(12,2)             | Default sale price         |
| `tax_rate`            | DECIMAL(5,2) DEFAULT 0    | Percentage                 |
| `stock_quantity`      | DECIMAL(12,3) DEFAULT 0   | Current on-hand            |
| `low_stock_threshold` | DECIMAL(12,3) NULL        | Alert when stock ≤ this    |
| `track_stock`         | BOOLEAN DEFAULT true      | Non-stock items (services) |
| `is_active`           | BOOLEAN                   |                            |
| `created_at`          | TIMESTAMPTZ               |                            |
| `updated_at`          | TIMESTAMPTZ               |                            |
| `deleted_at`          | TIMESTAMPTZ NULL          |                            |
| `version`             | INT DEFAULT 1             | Sync                       |

**Indexes:**

- `(tenant_id, barcode)` WHERE barcode IS NOT NULL AND deleted_at IS NULL
- `(tenant_id, name)` — trigram index for search (Step 3)
- `(tenant_id, category_id)`

### `stock_movements`

Immutable audit of every stock change.

| Column           | Type               | Notes                                                   |
| ---------------- | ------------------ | ------------------------------------------------------- |
| `id`             | UUID PK            |                                                         |
| `tenant_id`      | UUID FK → tenants  |                                                         |
| `product_id`     | UUID FK → products |                                                         |
| `movement_type`  | ENUM               | `SALE`, `RETURN`, `STOCK_IN`, `STOCK_OUT`, `ADJUSTMENT` |
| `quantity_delta` | DECIMAL(12,3)      | Positive = in, negative = out                           |
| `quantity_after` | DECIMAL(12,3)      | Snapshot after movement                                 |
| `reference_type` | VARCHAR(50) NULL   | `sale`, `manual`, …                                     |
| `reference_id`   | UUID NULL          | FK to source record                                     |
| `notes`          | TEXT NULL          |                                                         |
| `recorded_by`    | UUID FK → users    |                                                         |
| `created_at`     | TIMESTAMPTZ        |                                                         |

**Indexes:** `(tenant_id, product_id, created_at)`

---

## 4. Customers & Udhaar Ledger

### `customers`

| Column         | Type                    | Notes                                                                                                     |
| -------------- | ----------------------- | --------------------------------------------------------------------------------------------------------- |
| `id`           | UUID PK                 |                                                                                                           |
| `tenant_id`    | UUID FK → tenants       |                                                                                                           |
| `name`         | VARCHAR(255)            |                                                                                                           |
| `phone`        | VARCHAR(20) NULL        | Primary lookup in Karachi shops                                                                           |
| `email`        | VARCHAR(255) NULL       |                                                                                                           |
| `address`      | TEXT NULL               |                                                                                                           |
| `credit_limit` | DECIMAL(12,2) NULL      | NULL = no limit; soft warning only                                                                        |
| `balance`      | DECIMAL(12,2) DEFAULT 0 | **Denormalized cache** — updated transactionally on every ledger write; **never synced via LWW** (see §7) |
| `notes`        | TEXT NULL               |                                                                                                           |
| `is_active`    | BOOLEAN                 |                                                                                                           |
| `created_at`   | TIMESTAMPTZ             |                                                                                                           |
| `updated_at`   | TIMESTAMPTZ             |                                                                                                           |
| `deleted_at`   | TIMESTAMPTZ NULL        |                                                                                                           |
| `version`      | INT DEFAULT 1           | Sync                                                                                                      |

**Indexes:**

- `(tenant_id, phone)` WHERE deleted_at IS NULL
- `(tenant_id, name)`

### `customer_ledger_entries`

**Append-only audit trail.** Every credit sale, payment, adjustment, and void reversal.

| Column           | Type                 | Notes                                                        |
| ---------------- | -------------------- | ------------------------------------------------------------ |
| `id`             | UUID PK              |                                                              |
| `tenant_id`      | UUID FK → tenants    |                                                              |
| `customer_id`    | UUID FK → customers  |                                                              |
| `entry_type`     | ENUM                 | See below                                                    |
| `amount`         | DECIMAL(12,2)        | **Positive = customer owes more; negative = payment/credit** |
| `balance_after`  | DECIMAL(12,2)        | Running balance snapshot after this entry                    |
| `sale_id`        | UUID FK → sales NULL | Set when entry_type = CREDIT_SALE                            |
| `payment_method` | VARCHAR(50) NULL     | For PAYMENT: `cash`, `card`, `bank_transfer`                 |
| `notes`          | TEXT NULL            | Payment reference, adjustment reason                         |
| `recorded_by`    | UUID FK → users      | Staff who created entry                                      |
| `created_at`     | TIMESTAMPTZ          |                                                              |
| `voided_at`      | TIMESTAMPTZ NULL     | Set when voided                                              |
| `voided_by`      | UUID FK → users NULL | Requires `customers.ledger_edit`                             |
| `void_reason`    | TEXT NULL            |                                                              |
| `reversal_of_id` | UUID FK → self NULL  | Points to original entry if this is a reversal               |
| `version`        | INT DEFAULT 1        | Sync                                                         |

**`entry_type` values:**

| Type              | `amount` sign        | Description                    |
| ----------------- | -------------------- | ------------------------------ |
| `CREDIT_SALE`     | +                    | Sale completed on udhaar       |
| `PAYMENT`         | −                    | Customer paid down balance     |
| `ADJUSTMENT`      | +/−                  | Manual correction (admin only) |
| `OPENING_BALANCE` | +                    | Migration / initial balance    |
| `VOID_REVERSAL`   | opposite of original | Reverses a voided entry        |

**Rules:**

- Rows are never deleted. Void = set `voided_at` + insert `VOID_REVERSAL` entry.
- `balance_after` must equal previous balance + amount (enforced in service layer + DB constraint check).

**Indexes:**

- `(tenant_id, customer_id, created_at)`
- `(tenant_id, sale_id)` WHERE sale_id IS NOT NULL

### `customer_credit_obligations`

Tracks individual credit chunks for **aging reports**. Created on each credit sale; reduced FIFO on payments.

| Column             | Type                              | Notes                              |
| ------------------ | --------------------------------- | ---------------------------------- |
| `id`               | UUID PK                           |                                    |
| `tenant_id`        | UUID FK → tenants                 |                                    |
| `customer_id`      | UUID FK → customers               |                                    |
| `ledger_entry_id`  | UUID FK → customer_ledger_entries | The CREDIT_SALE entry              |
| `sale_id`          | UUID FK → sales                   |                                    |
| `original_amount`  | DECIMAL(12,2)                     | Amount at creation                 |
| `remaining_amount` | DECIMAL(12,2)                     | Decreases as payments applied FIFO |
| `created_at`       | TIMESTAMPTZ                       | **Aging clock starts here**        |
| `closed_at`        | TIMESTAMPTZ NULL                  | When remaining_amount reached 0    |
| `version`          | INT DEFAULT 1                     | Sync                               |

**Indexes:**

- `(tenant_id, customer_id, created_at)` WHERE remaining_amount > 0
- `(tenant_id, sale_id)`

### `customer_payment_allocations`

Links payments to the obligations they satisfy (FIFO audit trail).

| Column            | Type                                  | Notes                              |
| ----------------- | ------------------------------------- | ---------------------------------- |
| `id`              | UUID PK                               |                                    |
| `tenant_id`       | UUID FK → tenants                     |                                    |
| `ledger_entry_id` | UUID FK → customer_ledger_entries     | The PAYMENT entry                  |
| `obligation_id`   | UUID FK → customer_credit_obligations |                                    |
| `amount`          | DECIMAL(12,2)                         | Portion applied to this obligation |
| `created_at`      | TIMESTAMPTZ                           |                                    |

**Indexes:** `(ledger_entry_id)`, `(obligation_id)`

### Aging query logic

```sql
-- Per customer, bucket open obligations by age
SELECT
  customer_id,
  SUM(CASE WHEN age_days <= 7  THEN remaining_amount ELSE 0 END) AS bucket_0_7,
  SUM(CASE WHEN age_days BETWEEN 8 AND 30 THEN remaining_amount ELSE 0 END) AS bucket_8_30,
  SUM(CASE WHEN age_days > 30 THEN remaining_amount ELSE 0 END) AS bucket_30_plus
FROM (
  SELECT
    customer_id,
    remaining_amount,
    EXTRACT(DAY FROM NOW() - created_at)::INT AS age_days
  FROM customer_credit_obligations
  WHERE tenant_id = $1
    AND remaining_amount > 0
    AND closed_at IS NULL
) sub
GROUP BY customer_id;
```

---

## 5. Billing & Discounts

### `discount_rules`

| Column            | Type                      | Notes                          |
| ----------------- | ------------------------- | ------------------------------ |
| `id`              | UUID PK                   |                                |
| `tenant_id`       | UUID FK → tenants         |                                |
| `name`            | VARCHAR(255)              | Display name on billing screen |
| `discount_type`   | ENUM                      | `PERCENTAGE`, `FLAT`           |
| `value`           | DECIMAL(12,2)             | % or fixed amount              |
| `applies_to`      | ENUM                      | `ITEM`, `BILL`                 |
| `product_id`      | UUID FK → products NULL   | If item-specific               |
| `category_id`     | UUID FK → categories NULL | If category-specific           |
| `min_bill_amount` | DECIMAL(12,2) NULL        |                                |
| `is_active`       | BOOLEAN                   |                                |
| `created_at`      | TIMESTAMPTZ               |                                |
| `updated_at`      | TIMESTAMPTZ               |                                |
| `deleted_at`      | TIMESTAMPTZ NULL          |                                |
| `version`         | INT DEFAULT 1             | Sync                           |

### `sales`

| Column           | Type                     | Notes                                    |
| ---------------- | ------------------------ | ---------------------------------------- |
| `id`             | UUID PK                  |                                          |
| `tenant_id`      | UUID FK → tenants        |                                          |
| `sale_number`    | VARCHAR(50)              | Human-readable; per-tenant sequence      |
| `status`         | ENUM                     | `COMPLETED`, `VOIDED`                    |
| `customer_id`    | UUID FK → customers NULL | Required if any credit payment           |
| `subtotal`       | DECIMAL(12,2)            | Before discounts                         |
| `discount_total` | DECIMAL(12,2) DEFAULT 0  |                                          |
| `tax_total`      | DECIMAL(12,2) DEFAULT 0  |                                          |
| `grand_total`    | DECIMAL(12,2)            |                                          |
| `payment_status` | ENUM                     | `PAID`, `ON_CREDIT`, `PARTIAL` (Phase 2) |
| `notes`          | TEXT NULL                |                                          |
| `cashier_id`     | UUID FK → users          |                                          |
| `voided_at`      | TIMESTAMPTZ NULL         |                                          |
| `voided_by`      | UUID FK → users NULL     |                                          |
| `void_reason`    | TEXT NULL                |                                          |
| `created_at`     | TIMESTAMPTZ              |                                          |
| `updated_at`     | TIMESTAMPTZ              |                                          |
| `version`        | INT DEFAULT 1            | Sync                                     |

**Indexes:**

- `(tenant_id, created_at DESC)`
- `(tenant_id, sale_number)` UNIQUE
- `(tenant_id, customer_id)`

### `sale_items`

| Column            | Type                    | Notes                    |
| ----------------- | ----------------------- | ------------------------ |
| `id`              | UUID PK                 |                          |
| `tenant_id`       | UUID FK → tenants       |                          |
| `sale_id`         | UUID FK → sales         |                          |
| `product_id`      | UUID FK → products      |                          |
| `product_name`    | VARCHAR(255)            | Snapshot at time of sale |
| `unit_price`      | DECIMAL(12,2)           | Price at time of sale    |
| `quantity`        | DECIMAL(12,3)           |                          |
| `discount_amount` | DECIMAL(12,2) DEFAULT 0 | Per-line discount        |
| `tax_amount`      | DECIMAL(12,2) DEFAULT 0 |                          |
| `line_total`      | DECIMAL(12,2)           |                          |
| `created_at`      | TIMESTAMPTZ             |                          |

**Indexes:** `(sale_id)`, `(tenant_id, product_id)`

### `sale_payments`

Supports single payment in Phase 1; multiple rows in Phase 2 (split payment).

| Column            | Type                                   | Notes                                     |
| ----------------- | -------------------------------------- | ----------------------------------------- |
| `id`              | UUID PK                                |                                           |
| `tenant_id`       | UUID FK → tenants                      |                                           |
| `sale_id`         | UUID FK → sales                        |                                           |
| `payment_method`  | ENUM                                   | `CASH`, `CARD`, `BANK_TRANSFER`, `CREDIT` |
| `amount`          | DECIMAL(12,2)                          |                                           |
| `ledger_entry_id` | UUID FK → customer_ledger_entries NULL | Set when CREDIT                           |
| `created_at`      | TIMESTAMPTZ                            |                                           |

**Indexes:** `(sale_id)`

### `sale_sequences`

Per-tenant atomic sale number generator.

| Column        | Type                 | Notes                |
| ------------- | -------------------- | -------------------- |
| `tenant_id`   | UUID PK FK → tenants |                      |
| `last_number` | BIGINT DEFAULT 0     | Incremented per sale |

**Numbering scope:** Tenant-wide (not per-branch). Receipt numbers are unique across the business; `sales.branch_id` tags which location recorded the sale. Per-branch sequences would require `(tenant_id, branch_id)` as the PK — deferred unless a tenant explicitly needs separate receipt series per outlet.

### `branches` (Step 4)

| Column       | Type              | Notes                  |
| ------------ | ----------------- | ---------------------- |
| `id`         | UUID PK           |                        |
| `tenant_id`  | UUID FK → tenants |                        |
| `name`       | VARCHAR(255)      |                        |
| `code`       | VARCHAR(50)       | Unique per tenant      |
| `is_default` | BOOLEAN           | One default per tenant |
| `is_active`  | BOOLEAN           |                        |
| `deleted_at` | TIMESTAMPTZ NULL  | Soft delete            |

**`branch_id` on `sales` and `stock_movements`:** Tags which branch recorded the transaction for reporting and audit.

**Inventory scope (Phase 1):** `products.stock_quantity` is **tenant-wide shared** inventory. All branches draw from the same on-hand quantity; branch only records _where_ a sale or movement occurred. Per-branch stock (`branch_stock` table) is a future add-on for businesses with physically separate warehouses.

**`X-Branch-Id` header:** Must reference an active branch belonging to the request tenant. Staff users are restricted to `users.branch_id` when set, otherwise the tenant default branch. Client admins may use any tenant branch.

---

## 6. Settings & Audit

### `business_settings`

One row per tenant (1:1).

| Column                       | Type                      | Notes                                      |
| ---------------------------- | ------------------------- | ------------------------------------------ |
| `tenant_id`                  | UUID PK FK → tenants      |                                            |
| `business_name`              | VARCHAR(255)              | Receipt header                             |
| `address`                    | TEXT NULL                 |                                            |
| `phone`                      | VARCHAR(20) NULL          |                                            |
| `logo_url`                   | TEXT NULL                 | Path or URL                                |
| `currency`                   | VARCHAR(3) DEFAULT `PKR`  |                                            |
| `tax_label`                  | VARCHAR(50) DEFAULT `Tax` |                                            |
| `default_tax_rate`           | DECIMAL(5,2) DEFAULT 0    |                                            |
| `print_receipts_default`     | BOOLEAN DEFAULT false     | **Optional printing**                      |
| `receipt_footer`             | TEXT NULL                 |                                            |
| `max_discount_percent_staff` | DECIMAL(5,2) NULL         | Cap for staff without unlimited permission |
| `updated_at`                 | TIMESTAMPTZ               |                                            |
| `version`                    | INT DEFAULT 1             | Sync                                       |

### `audit_log`

| Column        | Type                   | Notes                                     |
| ------------- | ---------------------- | ----------------------------------------- |
| `id`          | UUID PK                |                                           |
| `tenant_id`   | UUID FK → tenants NULL | NULL for super-admin actions              |
| `user_id`     | UUID FK → users        |                                           |
| `action`      | VARCHAR(100)           | e.g. `sale.voided`, `ledger.entry_voided` |
| `entity_type` | VARCHAR(50)            |                                           |
| `entity_id`   | UUID                   |                                           |
| `metadata`    | JSONB NULL             | Before/after snapshots                    |
| `ip_address`  | INET NULL              |                                           |
| `created_at`  | TIMESTAMPTZ            |                                           |

**Indexes:** `(tenant_id, created_at DESC)`, `(entity_type, entity_id)`

---

## 7. Sync (schema now, used Step 5)

### Sync-excluded columns

Some denormalized fields must **never** be pushed or merged via last-write-wins. They are always recomputed locally after ledger/stock reconciliation.

| Table       | Column    | Recompute strategy                                                        |
| ----------- | --------- | ------------------------------------------------------------------------- |
| `customers` | `balance` | `SUM(amount)` from non-voided `customer_ledger_entries` for that customer |

The sync outbox must omit `balance` from `customers` UPDATE payloads. On pull, after applying ledger entries and obligations, run `recomputeCustomerBalance(customerId)` before marking the sync batch complete.

### `sync_outbox`

| Column           | Type              | Notes                                                |
| ---------------- | ----------------- | ---------------------------------------------------- |
| `id`             | UUID PK           |                                                      |
| `tenant_id`      | UUID FK → tenants |                                                      |
| `table_name`     | VARCHAR(100)      |                                                      |
| `record_id`      | UUID              |                                                      |
| `operation`      | ENUM              | `INSERT`, `UPDATE`, `DELETE`                         |
| `payload`        | JSONB             | Row snapshot                                         |
| `record_version` | INT               |                                                      |
| `status`         | ENUM              | `PENDING`, `SYNCED`, `CONFLICT`, `FAILED`            |
| `created_at`     | TIMESTAMPTZ       |                                                      |
| `synced_at`      | TIMESTAMPTZ NULL  |                                                      |
| `error_message`  | TEXT NULL         |                                                      |
| `retry_count`    | INT DEFAULT 0     | FAILED ingest attempts; escalates to CONFLICT at cap |

**Indexes:** `(tenant_id, status, created_at)` WHERE status = 'PENDING'

### `sync_state`

| Column           | Type                 | Notes                    |
| ---------------- | -------------------- | ------------------------ |
| `tenant_id`      | UUID PK FK → tenants |                          |
| `last_pulled_at` | TIMESTAMPTZ NULL     |                          |
| `last_pushed_at` | TIMESTAMPTZ NULL     |                          |
| `cloud_cursor`   | VARCHAR(255) NULL    | Server pagination cursor |

### `sync_changelog` (cloud hub)

Append-only feed written when the cloud **ingests** a change from a hybrid device. Other devices pull via `GET /sync/changes`.

| Column             | Type              | Notes                     |
| ------------------ | ----------------- | ------------------------- |
| `id`               | UUID PK           | Pull cursor               |
| `tenant_id`        | UUID FK → tenants |                           |
| `table_name`       | VARCHAR(100)      |                           |
| `record_id`        | UUID              |                           |
| `operation`        | ENUM              |                           |
| `payload`          | JSONB             | snake_case row snapshot   |
| `record_version`   | INT               |                           |
| `source_device_id` | VARCHAR(100) NULL | Hybrid device that pushed |
| `source_outbox_id` | UUID NULL         | Originating outbox row    |
| `created_at`       | TIMESTAMPTZ       |                           |

### `sync_devices` (cloud hub)

Per-hybrid-install credentials. `SYNC_API_KEY` in hybrid `.env` is the plaintext key returned once from `POST /sync/devices`.

| Column         | Type              | Notes                                              |
| -------------- | ----------------- | -------------------------------------------------- |
| `id`           | UUID PK           |                                                    |
| `tenant_id`    | UUID FK → tenants |                                                    |
| `device_id`    | VARCHAR(100)      | Unique per tenant; matches hybrid `SYNC_DEVICE_ID` |
| `api_key_hash` | VARCHAR(64)       | SHA-256 of device API key                          |
| `is_active`    | BOOLEAN           |                                                    |
| `last_seen_at` | TIMESTAMPTZ NULL  | Updated on each authenticated sync call            |

---

## 8. Key Relationships Summary

| Parent                      | Child                        | Relationship | On delete |
| --------------------------- | ---------------------------- | ------------ | --------- |
| tenants                     | users                        | 1:N          | restrict  |
| tenants                     | products                     | 1:N          | restrict  |
| tenants                     | customers                    | 1:N          | restrict  |
| customers                   | customer_ledger_entries      | 1:N          | restrict  |
| customers                   | customer_credit_obligations  | 1:N          | restrict  |
| customer_ledger_entries     | customer_payment_allocations | 1:N          | restrict  |
| customer_credit_obligations | customer_payment_allocations | 1:N          | restrict  |
| sales                       | sale_items                   | 1:N          | cascade   |
| sales                       | sale_payments                | 1:N          | restrict  |
| sales                       | customer_ledger_entries      | 1:0..1       | restrict  |
| products                    | stock_movements              | 1:N          | restrict  |
| users                       | sales (cashier)              | 1:N          | restrict  |

---

## 9. Transaction Boundaries (service layer)

### Concurrency: customer row locking

Every operation that writes a `customer_ledger_entry` (credit sale, payment, adjustment, void) **must** acquire an exclusive lock on the customer row at the start of the transaction:

```sql
SELECT id, balance FROM customers
WHERE id = $customer_id AND tenant_id = $tenant_id
FOR UPDATE;
```

This is required before computing `balance_after` and updating `customers.balance`. Without it, two concurrent payments (or a payment and a credit sale) can race and produce incorrect `balance_after` snapshots.

Implementation: use `prisma.$queryRaw` with `FOR UPDATE` inside `prisma.$transaction`, or equivalent via a `lockCustomerForUpdate(tx, customerId)` helper called at the top of every ledger write path.

---

Critical operations run in a single DB transaction. Stock decrements use an atomic conditional `UPDATE` (see `inventory/product-stock.ts`).

### Complete sale (cash)

```
BEGIN
  INSERT sale, sale_items, sale_payments
  UPDATE products.stock_quantity (each item)
  INSERT stock_movements (each item)
  UPDATE sale_sequences
COMMIT
```

### Complete sale (udhaar)

```
BEGIN
  -- lock customer row if credit payment
  SELECT ... FROM customers WHERE id = $customer_id FOR UPDATE
  INSERT sale, sale_items, sale_payments (method=CREDIT)
  UPDATE products.stock_quantity + stock_movements
  INSERT customer_ledger_entry (CREDIT_SALE, amount=+total)
  INSERT customer_credit_obligation
  UPDATE customers.balance += total
  UPDATE sale_sequences
COMMIT
```

### Record payment

```
BEGIN
  SELECT ... FROM customers WHERE id = $customer_id FOR UPDATE
  INSERT customer_ledger_entry (PAYMENT, amount=-payment)
  FIFO: UPDATE customer_credit_obligations.remaining_amount
  INSERT customer_payment_allocations (per obligation touched)
  UPDATE customers.balance -= payment
COMMIT
```

### Void sale

Reverses inventory and any associated udhaar entries. Sale must be `COMPLETED`; already-voided sales are rejected.

```
BEGIN
  SELECT ... FROM sales WHERE id = $sale_id FOR UPDATE
  -- reject if status != COMPLETED

  UPDATE sales SET status = VOIDED, voided_at, voided_by, void_reason

  -- Reverse stock for each sale_item
  FOR EACH sale_item:
    UPDATE products SET stock_quantity += item.quantity
    INSERT stock_movements (movement_type = RETURN, quantity_delta = +qty, reference = sale)

  -- If sale had a CREDIT payment (payment_status = ON_CREDIT):
  IF credit payment exists:
    SELECT ... FROM customers WHERE id = $customer_id FOR UPDATE
    UPDATE customer_ledger_entry (CREDIT_SALE) SET voided_at, voided_by, void_reason
    INSERT VOID_REVERSAL ledger entry (amount = -original)
    UPDATE customer_credit_obligation SET remaining_amount = 0, closed_at = NOW()
    UPDATE customers.balance -= credit_amount

  INSERT audit_log (action = sale.voided)
COMMIT
```

Cash/card sales skip the ledger block. Stock is always reversed regardless of payment method.

### Void ledger entry (admin)

```
BEGIN
  SELECT ... FROM customers WHERE id = $customer_id FOR UPDATE
  -- Phase 1 guard for PAYMENT voids (see below)
  UPDATE original entry SET voided_at, voided_by, void_reason
  INSERT VOID_REVERSAL entry (opposite amount)
  If CREDIT_SALE: close obligation (remaining_amount = 0, closed_at = NOW())
  If PAYMENT: reverse allocations, restore obligation remaining_amounts
  UPDATE customers.balance
  INSERT audit_log
COMMIT
```

### Void PAYMENT — Phase 1 restriction

Voiding a payment requires reversing FIFO allocations (restoring `remaining_amount` on each touched obligation). This is unsafe if any allocated obligation has since received **further payments** from other ledger entries.

**Phase 1 rule:** before voiding a `PAYMENT` entry, check:

```sql
SELECT EXISTS (
  SELECT 1
  FROM customer_payment_allocations pa
  JOIN customer_ledger_entries later_payment
    ON later_payment.id = pa.ledger_entry_id
  WHERE pa.obligation_id IN (
    SELECT obligation_id FROM customer_payment_allocations
    WHERE ledger_entry_id = $payment_entry_id
  )
  AND later_payment.entry_type = 'PAYMENT'
  AND later_payment.voided_at IS NULL
  AND later_payment.id != $payment_entry_id
  AND later_payment.created_at > (
    SELECT created_at FROM customer_ledger_entries WHERE id = $payment_entry_id
  )
);
```

If `true` → reject with `409 PAYMENT_VOID_BLOCKED_SUBSEQUENT_PAYMENTS`. Admin must void later payments first (newest-to-oldest) or wait for a full restore algorithm in a later phase.

Voiding `CREDIT_SALE`, `ADJUSTMENT`, and `OPENING_BALANCE` entries is not subject to this guard (but `CREDIT_SALE` void is typically reached via void sale, not directly).

---

## 10. Prisma Schema Location

The Prisma model definitions will live in `backend/prisma/schema.prisma` and mirror this document. Generated during Step 2 implementation.
