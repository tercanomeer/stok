import { z } from 'zod';

const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'Geçerli bir tutar girin.');
const rate = z.string().regex(/^\d{1,3}(\.\d{1,2})?$/, 'Geçerli bir oran girin.');

/**
 * Ayar güncelleme. Tüm alanlar isteğe bağlı — ekran yalnız değişeni gönderir.
 *
 * Kimlik bilgisi alanları (`eInvoiceSecret`, `smsApiKey`) YAZMA YÖNLÜdür: gönderilmezse
 * kayıtlı değer korunur, boş string gönderilirse silinir. API bunları asla düz metin
 * döndürmez, bu yüzden ekran maskeyi geri göndermek zorunda kalmaz.
 */
export const updateSettingsSchema = z
  .object({
    // --- Firma bilgileri (Tenant) ---
    name: z.string().trim().min(1).max(160).optional(),
    legalName: z.string().trim().max(200).optional(),
    taxNumber: z.string().trim().max(20).optional(),
    taxOffice: z.string().trim().max(80).optional(),
    phone: z.string().trim().max(20).optional(),
    email: z.union([z.literal(''), z.email()]).optional(),
    address: z.string().trim().max(400).optional(),

    // --- İşletme ayarları (TenantSettings) ---
    vatRates: z.array(z.number().int().min(0).max(100)).min(1).max(10).optional(),
    defaultVatRate: z.number().int().min(0).max(100).optional(),
    negativeStockPolicy: z.enum(['WARN', 'BLOCK']).optional(),
    highDiscountThreshold: rate.optional(),
    cashDifferenceThreshold: money.optional(),
    eArchiveThreshold: money.optional(),
    scaleBarcodePrefixes: z
      .array(
        z
          .string()
          .trim()
          .regex(/^\d{2,3}$/),
      )
      .max(5)
      .optional(),

    // --- Fiş şablonu ve yazıcı ---
    receiptHeader: z.string().max(300).optional(),
    receiptFooter: z.string().max(300).optional(),
    receiptPrinterName: z.string().trim().max(120).optional(),
    receiptWidthMm: z.union([z.literal(58), z.literal(80)]).optional(),
    autoPrintReceipt: z.boolean().optional(),

    // --- Entegrasyon kimlik bilgileri (yazma yönlü) ---
    eInvoiceUsername: z.string().trim().max(120).optional(),
    eInvoiceSecret: z.string().max(200).optional(),
    smsSenderTitle: z.string().trim().max(40).optional(),
    smsApiKey: z.string().max(200).optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.defaultVatRate === undefined ||
      v.vatRates === undefined ||
      v.vatRates.includes(v.defaultVatRate),
    {
      path: ['defaultVatRate'],
      message: 'Varsayılan KDV oranı, tanımlı oranlar listesinde olmalı.',
    },
  );

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
