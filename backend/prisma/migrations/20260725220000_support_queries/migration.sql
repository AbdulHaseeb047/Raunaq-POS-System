-- CreateEnum
CREATE TYPE "SupportQueryStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "support_queries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "topic" VARCHAR(80) NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "message" TEXT NOT NULL,
    "status" "SupportQueryStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "support_queries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_queries_tenant_id_created_at_idx" ON "support_queries"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "support_queries_status_created_at_idx" ON "support_queries"("status", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "support_queries" ADD CONSTRAINT "support_queries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_queries" ADD CONSTRAINT "support_queries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
