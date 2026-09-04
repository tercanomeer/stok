import type { CashSession, PosConfig, PosSession } from '@shared/ipc-contracts';

export type BootStep =
  'loading' | 'server-setup' | 'login' | 'register-select' | 'shift-open' | 'ready';

export interface BootState {
  loading: boolean;
  config: PosConfig | null;
  session: PosSession | null;
  shift: CashSession | null;
  /** Açık vardiya sorgusu sürüyor — vardiya açılış formu HENÜZ gösterilmez. */
  shiftLoading: boolean;
  /** Kullanıcı "sunucuyu değiştir" dedi — akış kurulum adımına geri döner. */
  editingServer: boolean;
  /** Kullanıcı "kasa değiştir" dedi. */
  editingRegister: boolean;
}

/**
 * Açılış akışının TEK karar noktası: splash → sunucu → giriş → kasa → vardiya → hazır.
 *
 * Bileşenlerin içine dağılmış `if`'ler yerine saf bir fonksiyon: adım sırası tek
 * yerde okunur ve testi bileşen render etmeden yazılır.
 */
export function resolveStep(state: BootState): BootStep {
  if (state.loading || !state.config) return 'loading';
  if (state.editingServer || !state.config.serverUrl) return 'server-setup';
  if (!state.session) return 'login';
  if (state.editingRegister || !state.config.registerId) return 'register-select';
  // Sorgu bitmeden formu göstermek, açık vardiyası olan kasada ekranın bir an
  // "yeni vardiya aç" deyip sonra kendiliğinden atlamasına yol açıyor.
  if (state.shiftLoading) return 'loading';
  if (!state.shift) return 'shift-open';
  return 'ready';
}
