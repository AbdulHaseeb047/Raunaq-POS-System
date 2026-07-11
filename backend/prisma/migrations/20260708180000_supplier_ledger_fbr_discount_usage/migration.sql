-- Supplier payable ledger, discount usage tracking, FBR settings

CREATE TYPE "SupplierLedgerEntryType" AS ENUM ('PURCHASE', 'PAYMENT', 'ADJUSTMENT');

ALTER TABLE "suppliers" ADD COLUMN "balance" DECIMAL(12,2) NOT NULL DEFAULT 0;

CREATE TABLE "supplier_ledger_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "entry_type" "SupplierLedgerEntryType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "balance_after" DECIMAL(12,2) NOT NULL,
    "reference_type" VARCHAR(50),
    "reference_id" UUID,
    "payment_method" VARCHAR(50),
    "notes" TEXT,
    "recorded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supplier_ledger_entries_tenant_id_supplier_id_created_at_idx" ON "supplier_ledger_entries"("tenant_id", "supplier_id", "created_at");

ALTER TABLE "supplier_ledger_entries" ADD CONSTRAINT "supplier_ledger_entries_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_ledger_entries" ADD CONSTRAINT "supplier_ledger_entries_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "discount_usages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "discount_rule_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discount_usages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "discount_usages_tenant_id_discount_rule_id_idx" ON "discount_usages"("tenant_id", "discount_rule_id");
CREATE INDEX "discount_usages_tenant_id_sale_id_idx" ON "discount_usages"("tenant_id", "sale_id");

ALTER TABLE "discount_usages" ADD CONSTRAINT "discount_usages_discount_rule_id_fkey" FOREIGN KEY ("discount_rule_id") REFERENCES "discount_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "discount_usages" ADD CONSTRAINT "discount_usages_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sales" ADD COLUMN "fbr_invoice_number" VARCHAR(100);
ALTER TABLE "sales" ADD COLUMN "fbr_qr_data" TEXT;

ALTER TABLE "business_settings" ADD COLUMN "fbr_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "business_settings" ADD COLUMN "fbr_pos_id" VARCHAR(50);
ALTER TABLE "business_settings" ADD COLUMN "fbr_strn" VARCHAR(50);
ALTER TABLE "business_settings" ADD COLUMN "fbr_registered_name" VARCHAR(255);
