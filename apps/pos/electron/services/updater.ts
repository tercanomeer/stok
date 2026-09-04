import type { UpdateEngine } from './update-engine';
import type { UpdateStatus } from '../shared/ipc-contracts';

/**
 * Otomatik güncelleme.
 *
 * Güncelleme sunucusunun adresi PAKETLEME değil ÇALIŞMA anında okunur
 * (`STOKK_UPDATE_URL`): yayın altyapısı henüz kurulmadığı için electron-builder'a
 * sabit bir feed gömmek, var olmayan bir adrese sürekli istek atan bir kurulum
 * üretirdi. Adres yoksa güncelleyici sessizce boşta kalır, uygulama normal çalışır.
 */
export class UpdaterService {
  private current: UpdateStatus = { phase: 'idle', version: null, percent: null, message: null };
  private listeners = new Set<(status: UpdateStatus) => void>();
  private wired = false;

  constructor(
    private readonly isPackaged: boolean,
    private readonly engine: UpdateEngine,
    private readonly feedUrl = process.env.STOKK_UPDATE_URL,
  ) {}

  get status(): UpdateStatus {
    return { ...this.current };
  }

  onChange(listener: (status: UpdateStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(next: Partial<UpdateStatus>): void {
    this.current = { ...this.current, ...next };
    for (const listener of this.listeners) listener(this.status);
  }

  /**
   * Kurulu sürümde ve feed tanımlıysa güncelleme kontrolünü başlatır.
   * Kurulum kasiyeri satışın ortasında kesmesin diye indirilen sürüm ÇIKIŞTA uygulanır.
   */
  start(): void {
    if (!this.isPackaged) {
      this.set({ phase: 'idle', message: 'Geliştirme modunda güncelleme kapalı.' });
      return;
    }
    if (!this.feedUrl) {
      this.set({ phase: 'idle', message: 'Güncelleme sunucusu tanımlı değil.' });
      return;
    }

    if (!this.wired) {
      this.wire();
      this.wired = true;
    }

    this.engine.configure(this.feedUrl);
    this.set({ phase: 'checking', message: 'Güncelleme kontrol ediliyor…' });
    this.engine.checkForUpdates().catch((error: unknown) => {
      this.set({
        phase: 'error',
        message: error instanceof Error ? error.message : 'Güncelleme kontrolü başarısız.',
      });
    });
  }

  private wire(): void {
    this.engine.on('update-available', (info) => {
      this.set({ phase: 'available', version: info.version, message: 'Yeni sürüm bulundu.' });
    });
    this.engine.on('update-not-available', () => {
      this.set({ phase: 'idle', message: 'Uygulama güncel.' });
    });
    this.engine.on('download-progress', (progress) => {
      this.set({ phase: 'downloading', percent: Math.round(progress.percent) });
    });
    this.engine.on('update-downloaded', (info) => {
      this.set({
        phase: 'ready',
        version: info.version,
        percent: 100,
        message: 'Güncelleme uygulamadan çıkınca kurulacak.',
      });
    });
    this.engine.on('error', (error) => {
      this.set({ phase: 'error', message: error.message });
    });
  }
}
