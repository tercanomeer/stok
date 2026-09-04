import type { NetworkState, NetworkStatus } from '../shared/ipc-contracts';

export interface NetworkMonitorOptions {
  /** `/health` yoklaması — başarılıysa sunucu ayakta demektir. */
  probe: () => Promise<boolean>;
  /** İşletim sisteminin ağ bağlantısı görüşü (Electron `net.isOnline()`). */
  isOnline: () => boolean;
  intervalMs?: number;
  clock?: () => Date;
}

/**
 * Ağ durumu izleyici.
 *
 * İki ayrı soru sorulur, çünkü kasiyer için sonuçları farklıdır:
 *  - `offline`     → internet yok (modem/kablo)
 *  - `unreachable` → internet var ama Stokk sunucusuna ulaşılamıyor (adres yanlış, sunucu kapalı)
 *  - `online`      → sunucu yanıt veriyor
 *
 * Yalnız `net.isOnline()`'a bakmak yanıltıcı olurdu: kasa yerel ağa bağlıyken de
 * bulut sunucusuna erişimi olmayabilir ve uygulama "çevrimiçiyim" diye satışı
 * kuyruğa almayı bırakırdı.
 */
export class NetworkMonitor {
  private timer: NodeJS.Timeout | null = null;
  private listeners = new Set<(status: NetworkStatus) => void>();
  private current: NetworkStatus;
  private probing = false;

  constructor(private readonly options: NetworkMonitorOptions) {
    this.current = {
      state: 'offline',
      lastOkAt: null,
      lastCheckedAt: this.now().toISOString(),
    };
  }

  private now(): Date {
    return (this.options.clock ?? (() => new Date()))();
  }

  get status(): NetworkStatus {
    return { ...this.current };
  }

  get isOnline(): boolean {
    return this.current.state === 'online';
  }

  onChange(listener: (status: NetworkStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.check(), this.options.intervalMs ?? 15_000);
    this.timer.unref?.();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  /** Tek yoklama. Üst üste binmez: yavaş bir yoklama sırasında yenisi başlatılmaz. */
  async check(): Promise<NetworkStatus> {
    if (this.probing) return this.status;
    this.probing = true;
    try {
      let state: NetworkState = 'offline';
      if (this.options.isOnline()) {
        state = (await this.options.probe()) ? 'online' : 'unreachable';
      }
      const checkedAt = this.now().toISOString();
      const next: NetworkStatus = {
        state,
        lastOkAt: state === 'online' ? checkedAt : this.current.lastOkAt,
        lastCheckedAt: checkedAt,
      };
      const changed = next.state !== this.current.state;
      this.current = next;
      if (changed) for (const listener of this.listeners) listener(this.status);
      return this.status;
    } finally {
      this.probing = false;
    }
  }
}
