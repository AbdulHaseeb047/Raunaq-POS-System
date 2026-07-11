-- Per-tenant hybrid device credentials (SYNC_API_KEY is per-device, not global)
CREATE TABLE "sync_devices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "device_id" VARCHAR(100) NOT NULL,
    "label" VARCHAR(255),
    "api_key_hash" VARCHAR(64) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sync_devices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sync_devices_tenant_id_device_id_key" ON "sync_devices"("tenant_id", "device_id");
CREATE UNIQUE INDEX "sync_devices_api_key_hash_key" ON "sync_devices"("api_key_hash");
CREATE INDEX "sync_devices_tenant_id_idx" ON "sync_devices"("tenant_id");

ALTER TABLE "sync_devices" ADD CONSTRAINT "sync_devices_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
