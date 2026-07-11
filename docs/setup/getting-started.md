# Getting Started (Development)

## Prerequisites

- **Node.js** 20 or later
- **PostgreSQL** 16+ running locally (for API development until Electron wrapper is built)
- **npm** 10+ (comes with Node 20)

## Setup

```bash
# From repository root
npm install

# Build shared types package (required by front + backend)
npm run build --workspace=shared

# Configure environment
cp backend/.env.example backend/.env
cp front/.env.example front/.env
```

Edit `backend/.env` with your local PostgreSQL credentials.

## Database setup (Step 2)

```bash
# Apply migrations
npm run db:migrate --workspace=backend

# Seed feature registry, tier presets, and Super Admin
npm run db:seed --workspace=backend
```

Default Super Admin (override via env):
- Email: `admin@pos.local`
- Password: `ChangeMe123!`

Set `SEED_SUPER_ADMIN_EMAIL` and `SEED_SUPER_ADMIN_PASSWORD` in `backend/.env` before seeding.

## Development

```bash
# Terminal 1 — API server (port 3001)
npm run dev:api

# Terminal 2 — Frontend (port 5173, proxies /api → backend)
npm run dev
```

Or both at once:

```bash
npm run dev:all
```

## Verify

- Frontend: http://localhost:5173
- API health: http://localhost:3001/health

## Code Quality

```bash
npm run lint          # ESLint all workspaces
npm run format:check  # Prettier check
npm run typecheck     # TypeScript check all workspaces
```

## Next Steps

Build Step 2 is complete (auth, RBAC, tenants). Step 3 implements billing, inventory, and the full udhaar ledger.
