-- Kök kategorilerde benzersizlik.
--
-- Şemadaki @@unique([tenantId, name, parentId]) kök kategorileri korumuyor: Postgres
-- NULL'ları birbirinden farklı sayar, dolayısıyla parentId IS NULL olan aynı isimli
-- kategoriler tekrar tekrar eklenebiliyor. Kısmi (partial) unique indeks bu boşluğu kapatır.
--
-- Prisma şema dilinde partial index ifade edilemediği için elle yazıldı; migration
-- geçmişinin parçası olduğu için drift üretmez.

CREATE UNIQUE INDEX "categories_tenantId_name_root_key"
  ON "categories" ("tenantId", "name")
  WHERE "parentId" IS NULL;
