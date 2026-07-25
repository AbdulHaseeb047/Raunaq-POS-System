-- Plan trialed during TRIAL window (soft-lock falls back to Starter after end).
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "trial_plan_tier" "TenantTier";

-- Backfill: use assigned tier as the trial plan for existing shops.
UPDATE "tenants"
SET "trial_plan_tier" = "tier"
WHERE "trial_plan_tier" IS NULL;

-- Shops auto-suspended by the old hard-expiry job: restore login so soft-lock can apply.
-- Manual revokes (reason not containing "Subscription period ended automatically") stay revoked.
UPDATE "tenants"
SET
  "is_active" = true,
  "access_revoked_at" = NULL,
  "access_revoke_reason" = NULL,
  "fee_status" = CASE
    WHEN "fee_status" = 'SUSPENDED' THEN 'TRIAL'
    ELSE "fee_status"
  END
WHERE "deleted_at" IS NULL
  AND "access_revoke_reason" ILIKE '%Subscription period ended automatically%';
