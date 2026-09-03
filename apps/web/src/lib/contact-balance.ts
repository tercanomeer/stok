import type { Contact } from './api-types';

/**
 * Bakiye sunumu — TEK yer. Konvansiyon (backend `ContactService`):
 * `balance > 0` cari BİZE borçlu (alacağımız), `balance < 0` BİZ cariye borçluyuz.
 *
 * Ekranda işaret çevrilmez; tutarın mutlak değeri ve ne anlama geldiği yazılır.
 * "-1.250,00 TL borç" gibi çift olumsuzlama esnafı yanıltır.
 */
export type BalanceDirection = 'receivable' | 'payable' | 'settled';

export interface BalanceView {
  direction: BalanceDirection;
  /** Gösterilecek mutlak tutar (string, hesap yapılmaz). */
  amount: string;
  label: string;
  tone: 'success' | 'danger' | 'warning';
}

export function balanceView(balance: string): BalanceView {
  const amount = balance.startsWith('-') ? balance.slice(1) : balance;
  const value = Number.parseFloat(balance);

  if (!Number.isFinite(value) || value === 0) {
    return { direction: 'settled', amount: '0', label: 'Hesap kapalı', tone: 'success' };
  }
  if (value > 0) {
    // Para dışarıda: tahsil edilecek alacak.
    return { direction: 'receivable', amount, label: 'Bize borçlu', tone: 'danger' };
  }
  return { direction: 'payable', amount, label: 'Biz borçluyuz', tone: 'warning' };
}

/**
 * Kredi limiti aşıldı mı. Limit 0 ise "limit yok" demektir, aşım hesaplanmaz.
 * Karşılaştırma yalnız EŞİK içindir; tutar hesabı sunucuda Decimal ile yapılır.
 */
export function isOverCreditLimit(contact: Contact): boolean {
  const limit = Number.parseFloat(contact.creditLimit);
  if (!Number.isFinite(limit) || limit <= 0) return false;
  const balance = Number.parseFloat(contact.balance);
  return Number.isFinite(balance) && balance > limit;
}

/** Limitin ne kadarı kullanılmış (0–1+). Limit yoksa null. */
export function creditUsageRatio(contact: Contact): number | null {
  const limit = Number.parseFloat(contact.creditLimit);
  if (!Number.isFinite(limit) || limit <= 0) return null;
  const balance = Number.parseFloat(contact.balance);
  if (!Number.isFinite(balance) || balance <= 0) return 0;
  return balance / limit;
}
