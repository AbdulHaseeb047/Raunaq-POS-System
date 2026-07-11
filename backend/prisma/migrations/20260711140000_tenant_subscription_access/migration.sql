ALTER TABLE "tenants"
  ADD COLUMN "subscription_start_at" TIMESTAMPTZ(6),
  ADD COLUMN "subscription_ends_at" TIMESTAMPTZ(6),
  ADD COLUMN "subscription_days" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "access_revoked_at" TIMESTAMPTZ(6),
  ADD COLUMN "access_revoke_reason" VARCHAR(500);

-- Backfill existing tenants with a 30-day window from their creation date
UPDATE "tenants"
SET
  "subscription_start_at" = "created_at",
  "subscription_ends_at" = "created_at" + INTERVAL '30 days'
WHERE "subscription_start_at" IS NULL AND "deleted_at" IS NULL;
