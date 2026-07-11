-- AlterTable
ALTER TABLE "users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;

-- Seeded Super Admin must change password on first login
UPDATE "users"
SET "must_change_password" = true
WHERE "role" = 'SUPER_ADMIN' AND "tenant_id" IS NULL;
