-- CreateEnum
CREATE TYPE "ExportJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "export_jobs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "report" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "status" "ExportJobStatus" NOT NULL DEFAULT 'PENDING',
    "params" JSONB NOT NULL DEFAULT '{}',
    "fileUrl" TEXT,
    "errorMessage" TEXT,
    "createdById" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "export_jobs_tenantId_createdAt_idx" ON "export_jobs"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS: export_jobs tenant izolasyonu (090000 migration'ından sonra oluştu).
GRANT SELECT, INSERT, UPDATE, DELETE ON "export_jobs" TO stokk_app;
ALTER TABLE "export_jobs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "export_jobs";
CREATE POLICY tenant_isolation ON "export_jobs"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
