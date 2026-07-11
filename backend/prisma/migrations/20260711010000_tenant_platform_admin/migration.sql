CREATE TYPE "TenantFeeStatus" AS ENUM ('TRIAL', 'ACTIVE', 'OVERDUE', 'SUSPENDED');

ALTER TABLE "tenants"
  ADD COLUMN "fee_status" "TenantFeeStatus" NOT NULL DEFAULT 'TRIAL',
  ADD COLUMN "monthly_fee" DECIMAL(12, 2),
  ADD COLUMN "fee_due_date" DATE,
  ADD COLUMN "acquired_by_id" UUID;

ALTER TABLE "users"
  ADD COLUMN "is_sales_rep" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "tenants"
  ADD CONSTRAINT "tenants_acquired_by_id_fkey"
  FOREIGN KEY ("acquired_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "tenants_acquired_by_id_idx" ON "tenants"("acquired_by_id");
