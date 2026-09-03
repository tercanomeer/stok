-- Faz 11: yazıcı varsayılanları + entegrasyon kimlik bilgileri.
-- Parola/anahtar alanları uygulamada AES-256-GCM ile şifrelenir; bu sütunlarda
-- düz metin secret TUTULMAZ ve API bunları maskeli döner.
ALTER TABLE "tenant_settings"
  ADD COLUMN "receiptPrinterName" TEXT,
  ADD COLUMN "receiptWidthMm" INTEGER NOT NULL DEFAULT 80,
  ADD COLUMN "autoPrintReceipt" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "eInvoiceUsername" TEXT,
  ADD COLUMN "eInvoiceSecretEnc" TEXT,
  ADD COLUMN "smsSenderTitle" TEXT,
  ADD COLUMN "smsApiKeyEnc" TEXT;
