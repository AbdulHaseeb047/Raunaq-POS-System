-- Staff branch assignment + Step 5 sync tables
ALTER TABLE "users" ADD COLUMN "branch_id" UUID;

ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TYPE "SyncOperation" AS ENUM ('INSERT', 'UPDATE', 'DELETE');
CREATE TYPE "SyncOutboxStatus" AS ENUM ('PENDING', 'SYNCED', 'CONFLICT', 'FAILED');

CREATE TABLE "sync_outbox" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "table_name" VARCHAR(100) NOT NULL,
    "record_id" UUID NOT NULL,
    "operation" "SyncOperation" NOT NULL,
    "payload" JSONB NOT NULL,
    "record_version" INTEGER NOT NULL,
    "status" "SyncOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "synced_at" TIMESTAMPTZ(6),
    "error_message" TEXT,
    CONSTRAINT "sync_outbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sync_outbox_tenant_id_status_created_at_idx"
  ON "sync_outbox"("tenant_id", "status", "created_at");

CREATE TABLE "sync_state" (
    "tenant_id" UUID NOT NULL,
    "last_pulled_at" TIMESTAMPTZ(6),
    "last_pushed_at" TIMESTAMPTZ(6),
    "cloud_cursor" VARCHAR(255),
    CONSTRAINT "sync_state_pkey" PRIMARY KEY ("tenant_id")
);

ALTER TABLE "sync_outbox" ADD CONSTRAINT "sync_outbox_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sync_state" ADD CONSTRAINT "sync_state_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
