-- Gider ve gelir kayıtları için yumuşak silme.
-- Mali kayıt fiziksel olarak silinmez; listeden düşer ama geçmiş korunur
-- (ürün, cari ve kategori kayıtlarındaki desenle aynı).
ALTER TABLE "expenses" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "incomes" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "expenses_tenantId_deletedAt_idx" ON "expenses"("tenantId", "deletedAt");
CREATE INDEX "incomes_tenantId_deletedAt_idx" ON "incomes"("tenantId", "deletedAt");
