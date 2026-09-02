-- Toplu import iş kaydı (Excel ürün import'u).

CREATE TYPE "ImportJobType" AS ENUM ('PRODUCT');
CREATE TYPE "ImportJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "import_jobs" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "type" "ImportJobType" NOT NULL,
  "status" "ImportJobStatus" NOT NULL DEFAULT 'PENDING',
  "fileName" TEXT NOT NULL,
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "processedRows" INTEGER NOT NULL DEFAULT 0,
  "createdCount" INTEGER NOT NULL DEFAULT 0,
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "errors" JSONB NOT NULL DEFAULT '[]',
  "createdById" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "import_jobs_tenantId_createdAt_idx" ON "import_jobs" ("tenantId", "createdAt");

ALTER TABLE "import_jobs"
  ADD CONSTRAINT "import_jobs_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "import_jobs"
  ADD CONSTRAINT "import_jobs_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS: yeni tenant tablosu politikayı otomatik almaz (Faz 2 notu) — elle ekleniyor.
ALTER TABLE "import_jobs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "import_jobs"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- stokk_app rolüne yetki (ALTER DEFAULT PRIVILEGES bunu zaten veriyor olmalı; garanti).
GRANT SELECT, INSERT, UPDATE, DELETE ON "import_jobs" TO stokk_app;
