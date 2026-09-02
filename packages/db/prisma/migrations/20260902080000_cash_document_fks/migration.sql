-- Vardiya mutabakatının denetlenebilmesi için eksik yabancı anahtarlar.
--
-- Üç sütun serbest metin olarak kalmıştı: cash_movements.saleId,
-- expenses.cashSessionId, incomes.cashSessionId. Bu haliyle silinmiş veya hiç
-- var olmamış bir belgeye işaret edebiliyor ve "bu gider hareketi hangi gidere
-- ait" sorusu cevaplanamıyordu — 01-proje.md "Vardiya & kasa" kapanış formülü
-- (açılış + nakit satış + tahsilat − gider − nakit iade) tam da bu bağları gerektiriyor.

CREATE INDEX "cash_movements_saleId_idx" ON "cash_movements" ("saleId");
CREATE INDEX "expenses_cashSessionId_idx" ON "expenses" ("cashSessionId");
CREATE INDEX "incomes_cashSessionId_idx" ON "incomes" ("cashSessionId");

ALTER TABLE "cash_movements"
  ADD CONSTRAINT "cash_movements_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "sales" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_cashSessionId_fkey"
  FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "incomes"
  ADD CONSTRAINT "incomes_cashSessionId_fkey"
  FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
