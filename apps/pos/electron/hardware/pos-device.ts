import { randomUUID } from 'node:crypto';

import { DeviceError } from './device-error';
import type { PosDeviceResult } from '../shared/ipc-contracts';

/**
 * Banka POS cihazı (ödeme terminali) sözleşmesi.
 *
 * Gerçek SDK'lar (Ingenico, Verifone, banka özel kütüphaneleri) sözleşmeye bağlı ve
 * henüz elimizde yok. Arayüz, gerçek cihaz geldiğinde DEĞİŞMEYECEK şekilde
 * tasarlandı; bunun için üç kural gözetildi:
 *
 *  1. **Tutar string.** Kuruş float'a çevrilmez; SDK'lar genelde kuruş tamsayısı
 *     ister, dönüşüm adaptörün içinde yapılır.
 *  2. **Her işlemin bir `referenceId`'si var.** Bağlantı koparsa (kasa çöktü, kablo
 *     çıktı) "ödeme geçti mi?" sorusu ancak bu referansla sorulabilir; `query()`
 *     bu yüzden arayüzün parçası, sonradan eklenecek bir şey değil.
 *  3. **İptal ayrı bir işlem.** Kasiyer ekranda vazgeçtiğinde cihazda başlamış bir
 *     işlem kalabilir; `cancel()` olmadan cihaz kilitli kalırdı.
 *
 * Şu an yalnız `mock` sürücü var; kasiyer akışı ve hata yolları onun üzerinden
 * test ediliyor.
 */
export interface PosDeviceAdapter {
  readonly name: string;
  /** Cihaz açık ve konuşuyor mu — ayarlardaki "POS ping" bunu çağırır. */
  ping(): Promise<{ ok: boolean; detail: string }>;
  /** Kart ödemesi başlatır; müşteri kartı okutup şifresini girene kadar bekler. */
  pay(input: { amount: string; referenceId: string }): Promise<PosDeviceResult>;
  /** Yarım kalmış bir işlemin akıbetini sorar. */
  query(referenceId: string): Promise<PosDeviceResult>;
  /** Süren işlemi iptal eder. */
  cancel(referenceId: string): Promise<void>;
}

/** Hiç cihaz tanımlı değilken kullanılan sürücü: her çağrı açık bir hata verir. */
export const nullPosDevice: PosDeviceAdapter = {
  name: 'Tanımsız',
  ping: () => Promise.reject(new DeviceError('DEVICE_NOT_CONFIGURED')),
  pay: () => Promise.reject(new DeviceError('DEVICE_NOT_CONFIGURED')),
  query: () => Promise.reject(new DeviceError('DEVICE_NOT_CONFIGURED')),
  cancel: () => Promise.reject(new DeviceError('DEVICE_NOT_CONFIGURED')),
};

/**
 * Geliştirme/demoda kullanılan sahte cihaz.
 *
 * Gerçek cihazın davranışını taklit eder: işlem bir referansla açılır, `approve`
 * ile onaylanır. Test edilmesi gereken asıl şey mutlu yol değil, YARIM KALMIŞ
 * işlemin sorgulanabilmesi.
 */
export function createMockPosDevice(): PosDeviceAdapter {
  const transactions = new Map<string, PosDeviceResult>();

  return {
    name: 'Sahte POS (geliştirme)',
    ping: () => Promise.resolve({ ok: true, detail: 'Sahte cihaz hazır.' }),
    pay: ({ amount, referenceId }) => {
      const result: PosDeviceResult = {
        referenceId,
        status: 'approved',
        amount,
        authCode: randomUUID().slice(0, 6).toUpperCase(),
        cardMask: '**** **** **** 4242',
        message: 'Ödeme onaylandı.',
      };
      transactions.set(referenceId, result);
      return Promise.resolve(result);
    },
    query: (referenceId) => {
      const result = transactions.get(referenceId);
      if (!result) {
        return Promise.resolve({
          referenceId,
          status: 'unknown',
          amount: null,
          authCode: null,
          cardMask: null,
          message: 'Bu işlem cihazda bulunamadı.',
        });
      }
      return Promise.resolve(result);
    },
    cancel: (referenceId) => {
      transactions.delete(referenceId);
      return Promise.resolve();
    },
  };
}
