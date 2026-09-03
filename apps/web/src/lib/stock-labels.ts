import type { StockMovementType } from './api-types';

/** Hareket tipi etiketleri — defterin dili esnafın dili. */
export const MOVEMENT_TYPE_LABELS: Record<StockMovementType, string> = {
  SALE: 'Satış',
  SALE_RETURN: 'Satış iadesi',
  PURCHASE: 'Alış',
  PURCHASE_RETURN: 'Alış iadesi',
  COUNT_ADJUSTMENT: 'Sayım farkı',
  WASTE: 'Fire',
  MANUAL_ADJUSTMENT: 'Manuel düzeltme',
};

export const MOVEMENT_TYPES = Object.keys(MOVEMENT_TYPE_LABELS) as StockMovementType[];

/**
 * `<input type="date">` değerini gün BAŞLANGICI ISO'suna çevirir (yerel gün,
 * UTC'de saklanır — CLAUDE.md). Boş girdi undefined döner.
 */
export function dateToIsoStart(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** Gün SONU ISO'su — `to` filtresi o günü de kapsasın. */
export function dateToIsoEnd(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** ISO → `<input type="date">` değeri (yerel gün). */
export function isoToDateInput(value: string | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}
