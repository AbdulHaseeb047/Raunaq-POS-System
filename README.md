# Raunaq POS System

Offline-first point-of-sale system for SMBs in Pakistan. The repository is a TypeScript monorepo with a React POS frontend, a React platform-admin app, a Fastify/Prisma backend, shared package exports, and an Electron desktop wrapper.

## Documentation

- [Architecture](ARCHITECTURE.md) - system design and implementation notes.
- [Database Schema](docs/SCHEMA.md) - database tables and relationships.
- [Backend-for-Frontend](docs/BACKEND-FOR-FRONTEND.md) - API contract notes.
- [Getting Started](docs/setup/getting-started.md) - setup guide.

## Prerequisites

- Node.js 20+
- PostgreSQL 16+
- npm workspaces

## Quick Start

```bash
npm install

# Copy environment examples before running locally.
cp backend/.env.example backend/.env
cp front/.env.example front/.env

# Run API + main POS frontend.
npm run dev:all
```

Useful commands:

```bash
npm run dev              # front app only
npm run dev:admin        # standalone admin app only
npm run dev:api          # backend API only
npm run dev:all          # backend API + front app
npm run build            # build all workspaces
npm run typecheck        # typecheck all workspaces
npm run lint             # lint all workspaces that provide lint scripts
npm run format           # format TS/JS/JSON/MD/CSS files
```

Backend database commands:

```bash
npm run db:generate --workspace=@pos/backend
npm run db:migrate --workspace=@pos/backend
npm run db:seed --workspace=@pos/backend
npm run db:studio --workspace=@pos/backend
```

## Workspace Overview

```text
.
|-- admin/      Standalone platform-admin React app.
|-- backend/    Fastify API, Prisma schema, services, routes, sync, tests.
|-- docs/       Project documentation.
|-- electron/   Desktop shell and local backend/Postgres host helpers.
|-- front/      Main POS React app used by shop users and embedded admin routes.
|-- mobile/     Placeholder mobile workspace notes.
|-- shared/     Shared constants, API types, feature registry, brand metadata.
|-- README.md   This file.
|-- package.json
|-- package-lock.json
|-- ARCHITECTURE.md
```

## Full Project Structure

Generated folders such as `node_modules/`, `dist/`, coverage output, and local `.env` files are intentionally not listed.

```text
.
|-- README.md
|-- ARCHITECTURE.md
|-- package.json
|-- package-lock.json
|-- .vscode/
|   |-- extensions.json
|   `-- settings.json
|
|-- docs/
|   |-- BACKEND-FOR-FRONTEND.md
|   |-- SCHEMA.md
|   `-- setup/
|       `-- getting-started.md
|
|-- shared/
|   |-- package.json
|   |-- tsconfig.json
|   |-- eslint.config.js
|   `-- src/
|       |-- api.ts
|       |-- brand.ts
|       |-- feature-registry.ts
|       |-- features.ts
|       `-- index.ts
|
|-- front/
|   |-- package.json
|   |-- index.html
|   |-- vite.config.ts
|   |-- tsconfig.json
|   |-- eslint.config.js
|   |-- .env.example
|   |-- public/
|   |   |-- favicon.png
|   |   |-- favicon.svg
|   |   |-- raunaq-logo-dark.png
|   |   |-- raunaq-logo-light.png
|   |   `-- raunaq-mark-reference.png
|   `-- src/
|       |-- main.tsx
|       |-- vite-env.d.ts
|       |-- app/
|       |   |-- App.tsx
|       |   |-- routes.tsx
|       |   `-- styles/
|       |       `-- index.css
|       |-- components/
|       |   |-- auth/
|       |   |   `-- RouteGuards.tsx
|       |   |-- billing/
|       |   |   |-- PurchaseSlipView.tsx
|       |   |   `-- ReceiptView.tsx
|       |   |-- brand/
|       |   |   |-- RaunaqLogo.tsx
|       |   |   `-- RaunaqMark.tsx
|       |   |-- catalog/
|       |   |   `-- ProductListPanel.tsx
|       |   |-- layout/
|       |   |   |-- AccountMenu.tsx
|       |   |   |-- AdminAppShell.tsx
|       |   |   |-- AppShell.tsx
|       |   |   |-- SidebarHeader.tsx
|       |   |   |-- SyncBanner.tsx
|       |   |   `-- SyncStatusBadge.tsx
|       |   |-- ui/
|       |   |   |-- Badge.tsx
|       |   |   |-- Button.tsx
|       |   |   |-- Card.tsx
|       |   |   |-- CollapsibleSection.tsx
|       |   |   |-- ConfirmDialog.tsx
|       |   |   |-- EmptyState.tsx
|       |   |   |-- Input.tsx
|       |   |   |-- Modal.tsx
|       |   |   |-- PageHeader.tsx
|       |   |   |-- QueryError.tsx
|       |   |   |-- Select.tsx
|       |   |   |-- Spinner.tsx
|       |   |   `-- StatCard.tsx
|       |   `-- icons.tsx
|       |-- features/
|       |   |-- admin/
|       |   |   |-- AdminDashboardPage.tsx
|       |   |   |-- ClientDetailPage.tsx
|       |   |   |-- ClientsPage.tsx
|       |   |   |-- FeaturePicker.tsx
|       |   |   |-- SalesRepsPage.tsx
|       |   |   `-- admin-utils.ts
|       |   |-- auth/
|       |   |   |-- AccountPasswordPage.tsx
|       |   |   |-- ChangePasswordPage.tsx
|       |   |   `-- LoginPage.tsx
|       |   |-- billing/
|       |   |   |-- SalePage.tsx
|       |   |   `-- SalesHistoryPage.tsx
|       |   |-- catalog/
|       |   |   |-- BrandsPage.tsx
|       |   |   `-- SuppliersPage.tsx
|       |   |-- customers/
|       |   |   `-- CustomersPage.tsx
|       |   |-- dashboard/
|       |   |   `-- DashboardPage.tsx
|       |   |-- discounts/
|       |   |   `-- DiscountsPage.tsx
|       |   |-- inventory/
|       |   |   |-- CategoriesPage.tsx
|       |   |   `-- InventoryPage.tsx
|       |   |-- reports/
|       |   |   `-- ReportsPage.tsx
|       |   |-- settings/
|       |   |   `-- SettingsPage.tsx
|       |   `-- staff/
|       |       `-- StaffPage.tsx
|       |-- lib/
|       |   |-- api.ts
|       |   |-- api-client.ts
|       |   |-- auth.tsx
|       |   |-- csv-utils.ts
|       |   |-- features.ts
|       |   |-- format.ts
|       |   |-- print-receipt.ts
|       |   |-- sale-utils.ts
|       |   |-- sales-pdf.ts
|       |   `-- use-sidebar-collapsed.ts
|       `-- types/
|           `-- api.ts
|
|-- admin/
|   |-- package.json
|   |-- index.html
|   |-- vite.config.ts
|   |-- tsconfig.json
|   `-- src/
|       |-- App.tsx
|       |-- main.tsx
|       |-- index.css
|       |-- vite-env.d.ts
|       |-- components/
|       |   |-- AccountMenu.tsx
|       |   |-- AppShell.tsx
|       |   |-- RaunaqLogo.tsx
|       |   |-- RaunaqMark.tsx
|       |   `-- ui.tsx
|       |-- lib/
|       |   |-- api.ts
|       |   `-- auth.tsx
|       `-- pages/
|           |-- ChangePasswordPage.tsx
|           |-- DashboardPage.tsx
|           |-- LoginPage.tsx
|           |-- SalesRepsPage.tsx
|           |-- TenantDetailPage.tsx
|           `-- TenantsPage.tsx
|
|-- backend/
|   |-- package.json
|   |-- tsconfig.json
|   |-- eslint.config.js
|   |-- vitest.config.ts
|   |-- .env.example
|   |-- prisma/
|   |   |-- schema.prisma
|   |   |-- seed.ts
|   |   `-- migrations/
|   |       |-- 20260706120000_step2_auth_rbac/
|   |       |-- 20260706130000_must_change_password/
|   |       |-- 20260706140000_step3_billing_inventory_udhaar/
|   |       |-- 20260706150000_step4_branches/
|   |       |-- 20260706160000_staff_branch_and_sync/
|   |       |-- 20260706200000_sync_changelog/
|   |       |-- 20260706210000_sync_devices/
|   |       |-- 20260706220000_sync_outbox_retry_count/
|   |       |-- 20260708160000_brands_suppliers_extras/
|   |       |-- 20260708180000_supplier_ledger_fbr_discount_usage/
|   |       |-- 20260710170000_printer_settings/
|   |       |-- 20260710230000_sale_cash_change/
|   |       |-- 20260711010000_tenant_platform_admin/
|   |       |-- 20260711120000_shipped_features_only/
|   |       |-- 20260711140000_tenant_subscription_access/
|   |       `-- migration_lock.toml
|   |-- scripts/
|   |   `-- test-db-connection.ts
|   `-- src/
|       |-- index.ts
|       |-- config.ts
|       |-- plugins/
|       |   |-- error-handler.plugin.ts
|       |   `-- prisma.plugin.ts
|       |-- test/
|       |   `-- db-fixtures.ts
|       |-- types/
|       |   `-- fastify.d.ts
|       `-- modules/
|           |-- admin/
|           |   |-- admin.routes.ts
|           |   `-- admin.service.ts
|           |-- audit/
|           |   `-- audit.service.ts
|           |-- auth/
|           |   |-- auth.routes.ts
|           |   |-- auth.schemas.ts
|           |   `-- auth.service.ts
|           |-- billing/
|           |   |-- billing.routes.ts
|           |   |-- billing.service.ts
|           |   |-- billing.totals.ts
|           |   |-- billing.totals.test.ts
|           |   |-- discounts.service.ts
|           |   |-- gift-cards.service.ts
|           |   |-- held-carts.service.ts
|           |   `-- sale-sequence.ts
|           |-- branches/
|           |   |-- branches.routes.ts
|           |   `-- branches.service.ts
|           |-- catalog/
|           |   |-- catalog.routes.ts
|           |   |-- catalog.service.ts
|           |   `-- supplier-ledger.service.ts
|           |-- core/
|           |   |-- branch.ts
|           |   |-- config.ts
|           |   |-- errors.ts
|           |   |-- money.ts
|           |   |-- prisma.ts
|           |   `-- tenant.ts
|           |-- customers/
|           |   |-- customer-lock.ts
|           |   |-- customers.routes.ts
|           |   |-- customers.service.ts
|           |   |-- ledger.fifo.test.ts
|           |   |-- ledger.integration.test.ts
|           |   `-- ledger.service.ts
|           |-- inventory/
|           |   |-- inventory.routes.ts
|           |   |-- inventory.service.ts
|           |   `-- product-stock.ts
|           |-- permissions/
|           |   |-- permissions.middleware.ts
|           |   |-- permissions.routes.ts
|           |   |-- permissions.service.ts
|           |   `-- permissions.test.ts
|           |-- printer/
|           |   |-- escpos.ts
|           |   `-- printer.service.ts
|           |-- reports/
|           |   |-- reports.routes.ts
|           |   `-- reports.service.ts
|           |-- settings/
|           |   |-- settings.routes.ts
|           |   `-- settings.service.ts
|           |-- sync/
|           |   |-- apply-change.ts
|           |   |-- changelog.service.ts
|           |   |-- cloud-client.ts
|           |   |-- cloud-record.service.ts
|           |   |-- ingest.integration.test.ts
|           |   |-- ingest.service.ts
|           |   |-- outbox.integration.test.ts
|           |   |-- outbox.service.ts
|           |   |-- outbox-issues.service.ts
|           |   |-- outbox-issues.test.ts
|           |   |-- payload-mapper.ts
|           |   |-- payload-mapper.test.ts
|           |   |-- pull.service.ts
|           |   |-- push.service.ts
|           |   |-- reconcile-balance.ts
|           |   |-- reconcile-remote.integration.test.ts
|           |   |-- reconcile-remote.service.ts
|           |   |-- reconcile-remote.test.ts
|           |   |-- sync-auth.middleware.ts
|           |   |-- sync-config.ts
|           |   |-- sync-device.integration.test.ts
|           |   |-- sync-device.service.ts
|           |   |-- sync-payload.ts
|           |   |-- sync-payload.test.ts
|           |   |-- sync.routes.ts
|           |   `-- worker.ts
|           |-- tenants/
|           |   |-- subscription.service.ts
|           |   |-- tenants.routes.ts
|           |   `-- tenants.service.ts
|           `-- users/
|               |-- users.routes.ts
|               `-- users.service.ts
|
|-- electron/
|   |-- package.json
|   |-- tsconfig.json
|   |-- eslint.config.js
|   `-- src/
|       |-- backend-host.ts
|       |-- main.ts
|       `-- postgres/
|           `-- manager.ts
|
`-- mobile/
    `-- README.md
```

## Folder Responsibilities

### `front/`

Main POS web app built with React, Vite, Tailwind CSS, React Router, and TanStack Query.

- `src/app/` contains app shell, route definitions, and global styles.
- `src/components/` contains reusable UI, layout, brand, billing, auth, and catalog components.
- `src/features/` contains page-level feature modules grouped by business area.
- `src/lib/` contains API clients, auth state, formatting, receipt/PDF helpers, CSV helpers, and UI state hooks.
- `src/types/` contains frontend API response/request types.
- `public/` contains favicon and Raunaq logo assets.

### `admin/`

Standalone platform-admin app. This is separate from the embedded admin routes in `front/`.

- `src/pages/` contains dashboard, tenant, sales rep, login, and password pages.
- `src/components/` contains app shell, account menu, brand components, and shared UI helpers.
- `src/lib/` contains admin API and auth helpers.

### `backend/`

Fastify API using Prisma for database access.

- `src/index.ts` starts the Fastify server.
- `src/plugins/` contains shared Fastify plugins.
- `src/modules/` groups route handlers, services, middleware, tests, and domain utilities by feature.
- `prisma/schema.prisma` defines the database model.
- `prisma/migrations/` stores database migrations.
- `prisma/seed.ts` seeds initial data.
- `scripts/` contains local helper scripts.

### `shared/`

Shared TypeScript package consumed by `front`, `admin`, and `backend`.

- `brand.ts` stores Raunaq brand constants.
- `features.ts` and `feature-registry.ts` define feature flags and feature metadata.
- `api.ts` stores shared API contracts/types.
- `index.ts` exports the public package surface.

### `electron/`

Electron desktop wrapper for local/offline and hybrid deployment.

- `main.ts` is the Electron entry point.
- `backend-host.ts` starts or manages the local backend process.
- `postgres/manager.ts` manages local PostgreSQL concerns.

### `docs/`

Project documentation for architecture, schema, setup, and backend-for-frontend behavior.

### `mobile/`

Placeholder documentation for a future mobile client.

## Naming Notes

- Product name: `Raunaq`
- Full product name: `Raunaq POS System`
- Shared brand constants live in `shared/src/brand.ts`.

## Testing and Verification

```bash
npm run typecheck
npm run lint
npm run test --workspace=@pos/backend
```
