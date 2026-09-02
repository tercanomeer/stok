-- Kullanıcı e-postası platform genelinde benzersiz.
--
-- Giriş ekranında tenant seçici yok (03-mimari.md "Kimlik & yetki": kayıt ve giriş
-- yalnız e-posta + şifre). Tenant başına benzersizlik, aynı e-postanın iki tenant'ta
-- bulunmasına izin verdiği için girişte hangi hesabın kastedildiği belirsiz kalıyordu.

DROP INDEX IF EXISTS "users_tenantId_email_key";
CREATE UNIQUE INDEX "users_email_key" ON "users" ("email");
