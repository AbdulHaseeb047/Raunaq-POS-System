-- Raunaq has three sellable plans. Preserve legacy Enterprise clients as Pro.
UPDATE "tenants"
SET "tier" = 'PRO'
WHERE "tier" = 'ENTERPRISE';

UPDATE "tenants"
SET "trial_plan_tier" = 'PRO'
WHERE "trial_plan_tier" = 'ENTERPRISE';

UPDATE "tenants"
SET "trial_plan_tier" = NULL
WHERE "fee_status" <> 'TRIAL';

DELETE FROM "tier_presets"
WHERE "tier" = 'ENTERPRISE';

ALTER TABLE "tenants" ALTER COLUMN "tier" DROP DEFAULT;

ALTER TYPE "TenantTier" RENAME TO "TenantTier_legacy";
CREATE TYPE "TenantTier" AS ENUM ('STARTER', 'STANDARD', 'PRO');

ALTER TABLE "tenants"
  ALTER COLUMN "tier" TYPE "TenantTier"
  USING ("tier"::text::"TenantTier"),
  ALTER COLUMN "trial_plan_tier" TYPE "TenantTier"
  USING ("trial_plan_tier"::text::"TenantTier");

ALTER TABLE "tier_presets"
  ALTER COLUMN "tier" TYPE "TenantTier"
  USING ("tier"::text::"TenantTier");

DROP TYPE "TenantTier_legacy";

ALTER TABLE "tenants"
  ALTER COLUMN "tier" SET DEFAULT 'STARTER';
