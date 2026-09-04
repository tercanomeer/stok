import fs from 'node:fs';
import path from 'node:path';

/** Dosya bu boyutu aşınca bir yedeğe döner. Kasa PC'sinin diskini doldurmamalı. */
const MAX_BYTES = 2 * 1024 * 1024;

/** Kaç yedek tutulacağı — bir haftalık arıza izini görmeye yeter. */
const KEEP = 3;

export type LogLevel = 'info' | 'warn' | 'error';

/**
 * Dosyaya yazan basit log.
 *
 * Paketlenmiş bir Electron uygulamasında `console.error`'ın gideceği bir terminal
 * YOKTUR: kasada bir arıza olduğunda destek "log dosyasını gönderin" diyemezdi.
 * Bu yüzden log `userData/logs/` altına yazılır ve boyutu sınırlanır.
 *
 * Log dosyasına PII yazılmaz (CLAUDE.md): burada yalnız cihaz/bağlantı bilgisi ve
 * hata metinleri durur; parola, kart no ve müşteri bilgisi buraya hiç gelmez.
 */
export class Logger {
  private stream: fs.WriteStream | null = null;

  constructor(private readonly file: string) {}

  private open(): fs.WriteStream | null {
    if (this.stream) return this.stream;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      this.rotateIfNeeded();
      this.stream = fs.createWriteStream(this.file, { flags: 'a' });
      return this.stream;
    } catch {
      // Log yazılamıyorsa uygulama ÇALIŞMAYA DEVAM EDER; kasa, log dosyası
      // açılamadı diye durmaz.
      return null;
    }
  }

  private rotateIfNeeded(): void {
    try {
      if (fs.statSync(this.file).size < MAX_BYTES) return;
    } catch {
      return; // dosya yok — döndürecek bir şey yok
    }
    for (let index = KEEP - 1; index >= 1; index -= 1) {
      const from = `${this.file}.${String(index)}`;
      if (fs.existsSync(from)) fs.renameSync(from, `${this.file}.${String(index + 1)}`);
    }
    fs.renameSync(this.file, `${this.file}.1`);
  }

  /**
   * Bir satır yazar. `context` teşhis için gereken bağlamdır (hangi cihaz, hangi
   * port, kaçıncı deneme) — "hata oldu" tek başına sahada işe yaramıyor.
   */
  write(level: LogLevel, scope: string, message: string, context?: Record<string, unknown>): void {
    const line = [
      new Date().toISOString(),
      level.toUpperCase(),
      `[${scope}]`,
      message,
      context ? JSON.stringify(context) : '',
    ]
      .filter(Boolean)
      .join(' ');

    // Geliştirmede konsol hâlâ en pratik yer; kurulu sürümde dosya tek kaynak.
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);

    this.open()?.write(`${line}\n`);
  }

  close(): void {
    this.stream?.end();
    this.stream = null;
  }
}

/**
 * Uygulama genelinde kullanılan log.
 *
 * Modül seviyesinde bir tekil: hata kaydı, hatanın oluştuğu yerde bağımlılık
 * enjeksiyonu beklemeden yazılabilmeli (ör. `DeviceError` kurucusu). `setLogger`
 * ile testlerde susturulur, `main.ts` açılışta gerçek dosyayı bağlar.
 */
let current: Logger | null = null;

export function setLogger(logger: Logger | null): void {
  current?.close();
  current = logger;
}

export function log(
  level: LogLevel,
  scope: string,
  message: string,
  context?: Record<string, unknown>,
): void {
  if (current) current.write(level, scope, message, context);
  else if (level === 'error') console.error(`[${scope}] ${message}`, context ?? '');
}
