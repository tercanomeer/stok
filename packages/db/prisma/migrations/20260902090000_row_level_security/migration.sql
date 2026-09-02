-- Tenant izolasyonu — 2. savunma katmanı (03-mimari.md "Multi-tenancy").
--
-- Prisma 7'de `$use()` middleware'i kaldırıldı; yerine gelen `$extends` query
-- extension'ı `$queryRaw`'ı kapsamıyor ve 02-teknoloji.md ağır rapor sorgularının
-- `$queryRaw` ile yazılacağını söylüyor. Bu yüzden filtre veritabanına indiriliyor:
-- uygulama tenantId'yi WHERE'e koymayı unutsa bile RLS 0 satır döndürür.
--
-- ÇALIŞMA ŞEKLİ
--   Uygulama her isteği bir transaction içinde açar ve tenant'ını bildirir:
--     SELECT set_config('app.tenant_id', '<jwt.tenantId>', true);
--   Politikalar bu ayarı okur. Ayar hiç verilmezse current_setting(..., true) NULL
--   döner, karşılaştırma NULL olur ve HİÇBİR satır görünmez — fail-closed.
--
-- ROLLER
--   stokk      — tablo sahibi. Migration, seed ve Studio bunu kullanır.
--                Postgres'te tablo sahibi RLS'i baypas eder; bu bilinçli.
--   stokk_app  — uygulamanın runtime rolü. Sahip DEĞİL, BYPASSRLS DEĞİL,
--                dolayısıyla politikalara tabidir. API bununla bağlanır.
--
--   Rol burada NOLOGIN olarak açılıyor — parola koda yazılmaz (CLAUDE.md "Güvenlik").
--   Giriş yetkisi ve parola `pnpm db:setup-app-role` ile env'den veriliyor.

-- ---------------------------------------------------------------------------
-- 1. Uygulama rolü
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stokk_app') THEN
    CREATE ROLE stokk_app NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO stokk_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO stokk_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO stokk_app;

-- İzin kataloğu sistem geneli ve salt okunur.
REVOKE INSERT, UPDATE, DELETE ON "permissions" FROM stokk_app;

-- Migration'lar yeni tablo eklediğinde yetki otomatik verilsin.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO stokk_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO stokk_app;

-- ---------------------------------------------------------------------------
-- 2. tenantId taşıyan tablolar
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'tenantId'
      AND tb.table_type = 'BASE TABLE'
    ORDER BY c.table_name
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($p$
      CREATE POLICY tenant_isolation ON %I
        USING ("tenantId" = current_setting('app.tenant_id', true))
        WITH CHECK ("tenantId" = current_setting('app.tenant_id', true))
    $p$, t);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. tenants — tenant yalnız kendini görür
-- ---------------------------------------------------------------------------
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "tenants";
CREATE POLICY tenant_isolation ON "tenants"
  USING ("id" = current_setting('app.tenant_id', true))
  WITH CHECK ("id" = current_setting('app.tenant_id', true));

-- ---------------------------------------------------------------------------
-- 4. Junction tabloları — tenant sınırı üst tablodan geliyor
-- ---------------------------------------------------------------------------
ALTER TABLE "role_permissions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "role_permissions";
CREATE POLICY tenant_isolation ON "role_permissions"
  USING (EXISTS (
    SELECT 1 FROM "roles" r
    WHERE r."id" = "role_permissions"."roleId"
      AND r."tenantId" = current_setting('app.tenant_id', true)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "roles" r
    WHERE r."id" = "role_permissions"."roleId"
      AND r."tenantId" = current_setting('app.tenant_id', true)));

ALTER TABLE "user_roles" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "user_roles";
CREATE POLICY tenant_isolation ON "user_roles"
  USING (EXISTS (
    SELECT 1 FROM "users" u
    WHERE u."id" = "user_roles"."userId"
      AND u."tenantId" = current_setting('app.tenant_id', true)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "users" u
    WHERE u."id" = "user_roles"."userId"
      AND u."tenantId" = current_setting('app.tenant_id', true)));
