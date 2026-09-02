-- CreateTable
CREATE TABLE "receipt_sequences" (
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receipt_sequences_pkey" PRIMARY KEY ("tenantId","kind")
);

-- RLS: receipt_sequences tenant izolasyonu (03-mimari — her tablo). Bu tablo
-- 090000_row_level_security migration'ından SONRA oluştu, o migration'ın DO döngüsü
-- geçmişte çalıştı; politikayı burada açıkça ekliyoruz. stokk_app zaten tablo GRANT'lerini
-- "ALL TABLES" ile aldı ama o da tek seferlikti → yeni tabloya ayrıca GRANT veriyoruz.
GRANT SELECT, INSERT, UPDATE, DELETE ON "receipt_sequences" TO stokk_app;

ALTER TABLE "receipt_sequences" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "receipt_sequences";
CREATE POLICY tenant_isolation ON "receipt_sequences"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
