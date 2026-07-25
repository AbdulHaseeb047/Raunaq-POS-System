-- AlterTable
ALTER TABLE "business_settings" ADD COLUMN IF NOT EXISTS "receipt_header_mode" VARCHAR(20) NOT NULL DEFAULT 'NAME';
