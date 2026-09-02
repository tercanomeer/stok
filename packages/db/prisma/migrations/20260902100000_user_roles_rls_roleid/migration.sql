-- user_roles RLS politikası: roleId'nin de tenant'ını doğrula.
--
-- İlk RLS migration'ında (20260902090000) user_roles politikası yalnız userId'nin
-- tenant'ını kontrol ediyordu; roleId serbest kalıyordu. Yani DB katmanı, bir tenant'ın
-- kullanıcısına BAŞKA bir tenant'ın rolünü bağlamayı engellemiyordu (03-mimari.md
-- "tek katmana güvenilmez" ilkesinin ihlali). role_permissions politikası roleId'yi
-- zaten doğru doğruluyor; user_roles onunla hizalanıyor.

DROP POLICY IF EXISTS tenant_isolation ON "user_roles";
CREATE POLICY tenant_isolation ON "user_roles"
  USING (
    EXISTS (
      SELECT 1 FROM "users" u
      WHERE u."id" = "user_roles"."userId"
        AND u."tenantId" = current_setting('app.tenant_id', true))
    AND EXISTS (
      SELECT 1 FROM "roles" r
      WHERE r."id" = "user_roles"."roleId"
        AND r."tenantId" = current_setting('app.tenant_id', true)))
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "users" u
      WHERE u."id" = "user_roles"."userId"
        AND u."tenantId" = current_setting('app.tenant_id', true))
    AND EXISTS (
      SELECT 1 FROM "roles" r
      WHERE r."id" = "user_roles"."roleId"
        AND r."tenantId" = current_setting('app.tenant_id', true)));
