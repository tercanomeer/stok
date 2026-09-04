/**
 * Kasiyerin klavye haritası (04-fazlar.md Faz 13).
 *
 * Kasada fare yoktur; günün tamamı bu on tuşla geçer. Tanımlar tek yerde durur ki
 * hem tuş dinleyicisi hem ekrandaki ipucu şeridi aynı listeden beslensin — biri
 * değişip diğeri unutulduğunda kasiyer ekranda yazan tuşa bastığında bir şey olmaz.
 */
export type SaleAction =
  | 'payment'
  | 'customer'
  | 'discount'
  | 'park'
  | 'parked'
  | 'return'
  | 'scale'
  | 'note'
  | 'closeShift'
  | 'settings'
  | 'clear';

export interface ShortcutDef {
  key: string;
  label: string;
  action: SaleAction;
  /** İpucu şeridinde gösterilsin mi — hepsi sığmıyor, en sık kullanılanlar gösteriliyor. */
  primary: boolean;
}

export const SHORTCUTS: readonly ShortcutDef[] = [
  { key: 'F1', label: 'Ödeme', action: 'payment', primary: true },
  { key: 'F2', label: 'Müşteri', action: 'customer', primary: true },
  { key: 'F3', label: 'İndirim', action: 'discount', primary: true },
  { key: 'F4', label: 'Park et', action: 'park', primary: true },
  { key: 'F5', label: 'Park listesi', action: 'parked', primary: true },
  { key: 'F6', label: 'İade', action: 'return', primary: true },
  { key: 'F7', label: 'Tartı', action: 'scale', primary: false },
  { key: 'F8', label: 'Satır notu', action: 'note', primary: false },
  { key: 'F9', label: 'Sepeti boşalt', action: 'clear', primary: false },
  { key: 'F10', label: 'Vardiya kapat', action: 'closeShift', primary: false },
  // Cihaz ayarları F1-F10 dışında: kasiyerin gün içinde basacağı bir tuş değil,
  // kurulum/arıza anında girilen bir ekran.
  { key: 'F12', label: 'Cihaz ayarları', action: 'settings', primary: false },
];

const BY_KEY = new Map(SHORTCUTS.map((shortcut) => [shortcut.key, shortcut.action]));

export function actionForKey(key: string): SaleAction | null {
  return BY_KEY.get(key) ?? null;
}
