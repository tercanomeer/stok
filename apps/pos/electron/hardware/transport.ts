/**
 * Cihaz bağlantısının dar yüzeyi.
 *
 * Termal yazıcı, terazi ve müşteri ekranı (VFD) arasındaki tek fark bayt akışının
 * NEREYE gittiğidir: bir COM portuna, bir TCP soketine ya da hiçbir yere. Protokol
 * kodu (ESC/POS, tartı ayrıştırma) bu arayüzün üstünde durur ve bağlantı türünü
 * BİLMEZ — gerçek cihaz geldiğinde değişmesi gereken tek şey `open()` içindeki
 * eşleme olsun diye.
 */
export interface Transport {
  /** Bayt gönderir. Yazıcıda tek yönlü akış; hata fırlatır, sessizce yutmaz. */
  write(data: Buffer): Promise<void>;
  /**
   * Gelen baytları okur. `timeoutMs` içinde `isComplete` doğrulanmazsa
   * `DEVICE_TIMEOUT` fırlatır. Tek yönlü bağlantılarda desteklenmez.
   */
  read(options: { timeoutMs: number; isComplete: (buffer: Buffer) => boolean }): Promise<Buffer>;
  close(): Promise<void>;
}

export type TransportKind = 'serial' | 'network' | 'none';

export interface SerialTransportConfig {
  kind: 'serial';
  /** COM3, /dev/ttyUSB0 … */
  path: string;
  baudRate: number;
}

export interface NetworkTransportConfig {
  kind: 'network';
  host: string;
  /** ESC/POS yazıcılarda yaygın olan RAW portu 9100. */
  port: number;
}

export interface NoTransportConfig {
  kind: 'none';
}

export type TransportConfig = SerialTransportConfig | NetworkTransportConfig | NoTransportConfig;

/** Bağlantı açıcı — testlerde sahte bir açıcı verilebilsin diye enjekte edilir. */
export type TransportOpener = (config: TransportConfig) => Promise<Transport>;
