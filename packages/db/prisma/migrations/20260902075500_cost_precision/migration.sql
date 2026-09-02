-- Birim maliyet alanlarının hassasiyetini 2 -> 4 ondalığa çıkar.
--
-- Ağırlıklı ortalama maliyet her alış faturasında yeniden hesaplanıyor ve doğrudan
-- bu sütuna yazılıyor. 2 ondalıkta her adım kuruşa yuvarlanıyor, sapma birikiyor ve
-- telafi edilmiyor (01-proje.md'deki "kuruş farkı tek yerde toplanır" kuralı yalnız
-- fiş toplamı için tanımlı, maliyet zinciri için değil).
--
-- Örnek: 7×10.00 + 3×10.03 -> gerçek ortalama 10.009
--   Decimal(12,2) -> 10.01  (sapma 0.001, her alışta tekrarlanır)
--   Decimal(14,4) -> 10.0090 (sapma 0)
--
-- sale_items.unitCost bu değerin satış anındaki dondurulmuş kopyası; kâr raporu
-- onu kullandığı için aynı hassasiyette olmak zorunda.

ALTER TABLE "products"        ALTER COLUMN "averageCost" SET DATA TYPE DECIMAL(14,4);
ALTER TABLE "products"        ALTER COLUMN "averageCost" SET DEFAULT 0.0000;
ALTER TABLE "stock_movements" ALTER COLUMN "unitCost"    SET DATA TYPE DECIMAL(14,4);
ALTER TABLE "sale_items"      ALTER COLUMN "unitCost"    SET DATA TYPE DECIMAL(14,4);
ALTER TABLE "sale_items"      ALTER COLUMN "unitCost"    SET DEFAULT 0.0000;
