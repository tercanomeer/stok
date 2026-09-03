-- Denetim kaydı yalnız EKLENİR: uygulama rolü (stokk_app) audit satırını
-- güncelleyemez ve silemez. API'de zaten yazma/silme ucu yok ama bir SQL
-- enjeksiyonu ya da ileride eklenecek hatalı bir ham sorgu, tenant'ın kendi
-- denetim izini temizleyebilirdi (security-auditor bulgusu).
-- Saklama/arşivleme gerekirse tablo sahibi (stokk) rolüyle çalışan bakım işi yapar.
REVOKE UPDATE, DELETE ON "audit_logs" FROM stokk_app;
