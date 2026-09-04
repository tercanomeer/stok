import { type BrowserWindow, screen } from 'electron';

import type { DeviceConfig } from './device-config';
import { log } from '../lib/logger';
import type { CustomerDisplayState } from '../shared/ipc-contracts';

export interface CustomerDisplayDeps {
  getConfig: () => DeviceConfig;
  /**
   * Pencereyi AÇAN taraf dışarıdan verilir.
   *
   * `window.ts`'i doğrudan import etmek bu dosyayı electron'a bağlıyordu
   * (`app.isPackaged` modül yüklenirken okunuyor) ve servis Node ortamında
   * hiç test edilemiyordu.
   */
  createWindow: () => BrowserWindow;
  listDisplays?: () => Electron.Display[];
}

/**
 * Müşteri ekranı — kasanın karşısına dönük ikinci monitör.
 *
 * Seri VFD (2×20 karakter) yerine tam ekran bir pencere seçildi: aynı donanım
 * parası daha büyük ve okunur bir ekran alıyor, kampanya/logo gösterilebiliyor ve
 * ayrı bir sürücü katmanı gerekmiyor. Seri VFD'ler için ileride `Transport`
 * üzerinden ikinci bir sürücü eklenebilir; bu sınıfın yüzeyi değişmez.
 *
 * Durum main process'ten YAYINLANIR: satış ekranı sepeti main'e bildirir, main
 * müşteri ekranına iletir. Renderer'lar birbirine doğrudan konuşmaz.
 */
export class CustomerDisplayService {
  private window: BrowserWindow | null = null;
  private lastState: CustomerDisplayState | null = null;

  constructor(private readonly deps: CustomerDisplayDeps) {}

  get enabled(): boolean {
    return this.deps.getConfig().customerDisplay.enabled;
  }

  get open(): boolean {
    return this.window !== null && !this.window.isDestroyed();
  }

  /** Kullanılabilir ekranlar — ayarlar ekranı hangi monitöre basacağını sorar. */
  displays(): { id: number; label: string; primary: boolean }[] {
    const list = (this.deps.listDisplays ?? (() => screen.getAllDisplays()))();
    const primaryId = list[0]?.id;
    return list.map((display, index) => ({
      id: display.id,
      label: `Ekran ${String(index + 1)} — ${String(display.size.width)}×${String(display.size.height)}`,
      primary: display.id === primaryId,
    }));
  }

  /**
   * Müşteri ekranının açılacağı monitör.
   *
   * Ayarda seçili ekran yoksa BİRİNCİL OLMAYAN ilk ekran kullanılır. Tek
   * monitörlü bir kasada hiçbir ekran uygun DEĞİLDİR: pencereyi kasiyerin
   * ekranına tam ekran açmak kasayı kullanılamaz hâle getirir.
   */
  private targetDisplay(): Electron.Display | null {
    const config = this.deps.getConfig().customerDisplay;
    const displays = (this.deps.listDisplays ?? (() => screen.getAllDisplays()))();
    const chosen = displays.find((display) => display.id === config.displayId);
    if (chosen) return chosen;
    return displays.find((_display, index) => index > 0) ?? null;
  }

  /** Açılabilir bir müşteri ekranı var mı — ayarlar ekranı bunu uyarı olarak gösterir. */
  get available(): boolean {
    return this.targetDisplay() !== null;
  }

  /** Ekranı açar. Uygun monitör yoksa AÇMAZ. */
  start(): void {
    if (!this.enabled || this.open) return;

    const target = this.targetDisplay();
    if (!target) {
      log('warn', 'display', 'ikinci monitör bulunamadı; müşteri ekranı açılmadı');
      return;
    }

    const window = this.deps.createWindow();
    this.window = window;
    window.once('closed', () => {
      this.window = null;
    });

    window.setBounds(target.bounds);
    window.setFullScreen(true);

    // Ekran sonradan açıldıysa son durumu hemen görsün; boş ekran "bozuk" görünür.
    window.webContents.once('did-finish-load', () => {
      if (this.lastState) this.push(this.lastState);
    });
  }

  stop(): void {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.destroy();
    this.window = null;
  }

  /** Ayar değişince ekranı aç/kapat. */
  applyConfig(): void {
    if (this.enabled) {
      if (!this.open) this.start();
    } else {
      this.stop();
    }
  }

  /** Sepet durumunu müşteri ekranına yayınlar. */
  push(state: CustomerDisplayState): void {
    this.lastState = state;
    if (!this.window || this.window.isDestroyed()) return;
    this.window.webContents.send('event:customer-display', state);
  }
}
