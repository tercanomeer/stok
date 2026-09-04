import { DeviceError } from './device-error';
import type { FiscalResult, ReceiptData } from '../shared/ipc-contracts';

/**
 * ÖKC (Ödeme Kaydedici Cihaz / yeni nesil yazarkasa) sözleşmesi.
 *
 * Türkiye'de perakende satışın mali belgesini ÖKC üretir; kasa yazılımı satışı
 * cihaza bildirir, cihaz mali fiş numarası ve karekod (ZRaporu/GİB doğrulama)
 * döndürür. Gerçek entegrasyon cihaz üreticisinin TSM sözleşmesine bağlı.
 *
 * Arayüz iki şeyi baştan doğru kuruyor:
 *  1. **Girdi `ReceiptData`.** Satış zaten hesaplanmış hâlde; ÖKC'ye ayrı bir
 *     model üretmek, iki yerde farklı KDV kırılımı riski demekti.
 *  2. **Sonuç fişe geri döner.** `fiscalNo` ve `qrData` fiş üzerine basılır;
 *     bu yüzden `printReceipt` çağrısından ÖNCE alınır.
 */
export interface FiscalAdapter {
  readonly name: string;
  ping(): Promise<{ ok: boolean; detail: string }>;
  /** Satışı mali cihaza bildirir; mali fiş no ve karekod döner. */
  registerSale(receipt: ReceiptData): Promise<FiscalResult>;
}

export const nullFiscal: FiscalAdapter = {
  name: 'Tanımsız',
  ping: () => Promise.reject(new DeviceError('DEVICE_NOT_CONFIGURED')),
  registerSale: () => Promise.reject(new DeviceError('DEVICE_NOT_CONFIGURED')),
};

/**
 * Sahte ÖKC. Karekod içeriği gerçek GİB doğrulama adresinin biçimini taklit eder
 * ki fiş şablonu ve ekran, gerçek cihaz geldiğinde uzunluk sürprizi yaşamasın.
 */
export function createMockFiscal(): FiscalAdapter {
  let counter = 0;

  return {
    name: 'Sahte ÖKC (geliştirme)',
    ping: () => Promise.resolve({ ok: true, detail: 'Sahte mali cihaz hazır.' }),
    registerSale: (receipt) => {
      counter += 1;
      const fiscalNo = `Z${String(counter).padStart(6, '0')}`;
      return Promise.resolve({
        fiscalNo,
        qrData: `https://ebelge.gib.gov.tr/dogrulama?no=${fiscalNo}&t=${receipt.grandTotal}`,
        registeredAt: new Date().toISOString(),
      });
    },
  };
}
