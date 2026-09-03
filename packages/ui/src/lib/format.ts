import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { tr } from 'date-fns/locale';

/**
 * Gösterim formatlayıcıları — `tr-TR`. Para ve miktar API'den STRING gelir
 * ("24", "123.45"); burada YALNIZ gösterim biçimlenir, hesap yapılmaz
 * (hesap pos-core/backend'de — CLAUDE.md). Float'a çevirme yalnız Intl'e
 * beslemek için; sonuç asla geri hesaba girmez.
 */

const TRY = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const DECIMAL = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

const INTEGER = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });

function toNumber(value: string | number): number {
  return typeof value === 'number' ? value : Number.parseFloat(value);
}

/** Para: "1234.5" → "₺1.234,50". Geçersiz girdi → "₺0,00". */
export function formatMoney(value: string | number): string {
  const n = toNumber(value);
  return TRY.format(Number.isFinite(n) ? n : 0);
}

/** Miktar: "2.5" → "2,5" (birimsiz; birim çağıran tarafta eklenir). */
export function formatQuantity(value: string | number): string {
  const n = toNumber(value);
  return DECIMAL.format(Number.isFinite(n) ? n : 0);
}

/** Tam sayı sayaç: 1234 → "1.234". */
export function formatCount(value: number): string {
  return INTEGER.format(Number.isFinite(value) ? value : 0);
}

/** Yüzde: 12.5 → "%12,5" (girdi zaten yüzde değeri; Türkçe'de işaret başta). */
export function formatPercent(value: string | number, fractionDigits = 1): string {
  const n = toNumber(value);
  const body = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  }).format(Number.isFinite(n) ? n : 0);
  return `%${body}`;
}

function toDate(value: string | Date): Date {
  return typeof value === 'string' ? parseISO(value) : value;
}

/** Tarih: ISO → "3 Eyl 2026". */
export function formatDate(value: string | Date): string {
  return format(toDate(value), 'd MMM yyyy', { locale: tr });
}

/** Tarih + saat: ISO → "3 Eyl 2026 14:05". */
export function formatDateTime(value: string | Date): string {
  return format(toDate(value), 'd MMM yyyy HH:mm', { locale: tr });
}

/** Yalnız saat: ISO → "14:05". */
export function formatTime(value: string | Date): string {
  return format(toDate(value), 'HH:mm', { locale: tr });
}

/** Göreli: ISO → "3 dakika önce". */
export function formatRelative(value: string | Date): string {
  return formatDistanceToNow(toDate(value), { locale: tr, addSuffix: true });
}
