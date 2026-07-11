-- Cloud changelog for hybrid pull (changes ingested from devices + replay to other devices)
CREATE TABLE "sync_changelog" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "table_name" VARCHAR(100) NOT NULL,
    "record_id" UUID NOT NULL,
    "operation" "SyncOperation" NOT NULL,
    "payload" JSONB NOT NULL,
    "record_version" INTEGER NOT NULL,
    "source_device_id" VARCHAR(100),
    "source_outbox_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sync_changelog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sync_changelog_tenant_id_created_at_id_idx"
  ON "sync_changelog"("tenant_id", "created_at", "id");

ALTER TABLE "sync_changelog" ADD CONSTRAINT "sync_changelog_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
