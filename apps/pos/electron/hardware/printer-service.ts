import { isConfigured, type DeviceConfig } from './device-config';
import { DeviceError, toDeviceError } from './device-error';
import type { Transport, TransportOpener } from './transport';
import type { PosDatabase } from '../db/database';
import type { PrintJob, ReceiptData } from '../shared/ipc-contracts';
import {
  decodePrinterStatus,
  STATUS_QUERY_PAPER,
  STATUS_QUERY_PRINTER,
  type PrinterStatus,
} from './escpos/encoder';
import { loadLogo, type RasterLogo } from './escpos/logo';
import {
  LOGO_MAX_WIDTH,
  renderDrawerKick,
  renderReceipt,
  renderTestReceipt,
} from './escpos/receipt';
import * as queue from '../db/print-queue-repo';
import { log } from '../lib/logger';

/**
 * Durum sorgusu için bekleme süresi.
 *
 * Kısa tutuluyor: yanıt vermeyen yazıcılar (ucuz modellerin bir kısmı `DLE EOT`
 * desteklemez) fişi geciktirmemeli. Cevap gelmezse durum BİLİNMİYOR sayılır ve
 * baskı denenir — sormak bir engel değil, ek bir güvence.
 */
const STATUS_TIMEOUT_MS = 400;

export interface PrinterDeps {
  db: PosDatabase;
  openTransport: TransportOpener;
  getConfig: () => DeviceConfig;
  /** Fiş genişliği tenant ayarından gelir (58/80 mm). */
  getWidthMm: () => 58 | 80;
  /** Logo çözücü — testlerde `nativeImage`'e (electron) bağımlılık olmasın diye ayrı. */
  loadLogo?: (path: string, maxWidth: number) => RasterLogo;
  clock?: () => Date;
}

/**
 * Fiş yazıcısı.
 *
 * **Yazdırma satışı ASLA engellemez.** Kağıt bittiğinde, kablo çıktığında ya da
 * yazıcı tanımsızken satış tamamlanır, fiş yeniden yazdırma kuyruğuna alınır ve
 * kasiyer üst şeritten uyarı görür. Kasada satışın durması, basılmayan bir fişten
 * çok daha pahalıdır.
 *
 * Aynı anda tek iş gönderilir: iki fiş aynı porta paralel yazılırsa baytlar
 * birbirine karışır ve iki fiş de okunamaz çıkar.
 */
export class PrinterService {
  private inFlight: Promise<unknown> = Promise.resolve();

  constructor(private readonly deps: PrinterDeps) {}

  private now(): Date {
    return (this.deps.clock ?? (() => new Date()))();
  }

  /**
   * Logoyu okur. Okunamıyorsa fiş LOGOSUZ basılır: bozuk bir logo dosyası
   * yüzünden satış fişinin hiç çıkmaması kabul edilemez.
   */
  private logo(): RasterLogo | null {
    const logoPath = this.deps.getConfig().printer.logoPath;
    if (!logoPath) return null;
    try {
      return (this.deps.loadLogo ?? loadLogo)(logoPath, LOGO_MAX_WIDTH[this.deps.getWidthMm()]);
    } catch (error) {
      log('warn', 'printer', 'logo okunamadı, fiş logosuz basılıyor', {
        logoPath,
        detail: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  get configured(): boolean {
    return isConfigured(this.deps.getConfig().printer.transport);
  }

  /** Bekleyen (basılamamış) fiş sayısı — üst şeritte gösterilir. */
  pendingCount(): number {
    return queue.countPending(this.deps.db);
  }

  pending(): PrintJob[] {
    return queue.listPending(this.deps.db);
  }

  /**
   * Satış fişini basar. Basılamazsa HATA FIRLATMAZ; işi kuyruğa alır ve
   * `queued` döner — çağıran satışı geri almasın.
   */
  async printReceipt(
    receipt: ReceiptData,
    options: { copy?: boolean; cashSale?: boolean } = {},
  ): Promise<{ printed: boolean; queued: boolean; message: string | null }> {
    const config = this.deps.getConfig();
    const payload = renderReceipt(receipt, {
      codepage: config.printer.codepage,
      widthMm: this.deps.getWidthMm(),
      logo: this.logo(),
      ...(options.copy === undefined ? {} : { copy: options.copy }),
    });

    // Çekmece darbesi fişin SONUNA eklenir: iki ayrı bağlantı açmak, yazıcı
    // meşgulken çekmecenin hiç açılmamasına yol açıyordu.
    const withDrawer =
      options.cashSale && config.printer.openDrawerOnCashSale
        ? Buffer.concat([payload, renderDrawerKick(config.printer.codepage)])
        : payload;

    try {
      // Fişten ÖNCE kağıt/kapak sorulur: baytlar porta gidince "yazdım" sanılır,
      // kağıt yoksa kasiyer bunu ancak boş ruloya bakınca anlardı.
      await this.send(withDrawer, { checkStatus: true });
      return { printed: true, queued: false, message: null };
    } catch (error) {
      const deviceError = toDeviceError(error, 'DEVICE_UNREACHABLE');
      log('error', 'printer', 'fiş basılamadı', {
        clientSaleId: receipt.clientSaleId,
        code: deviceError.code,
        transport: config.printer.transport.kind,
        configured: this.configured,
      });
      // Yazıcı HİÇ tanımlı değilse kuyruğa almak anlamsız: sonradan basılacağı
      // bir cihaz yok, kuyruk her satışta bir satır daha birikirdi. Kuyruk
      // "yazıcı var ama şu an basamadı" durumu içindir.
      if (!this.configured) {
        return { printed: false, queued: false, message: deviceError.message };
      }
      queue.enqueue(this.deps.db, {
        clientSaleId: receipt.clientSaleId,
        receipt,
        error: deviceError.message,
        now: this.now(),
      });
      return { printed: false, queued: true, message: deviceError.message };
    }
  }

  /**
   * Kuyrukta bekleyen fişleri sırayla dener.
   *
   * İletişim hatasında DURUR (yazıcı hâlâ kapalıysa kalan işleri denemek her biri
   * için bir zaman aşımı daha bekletirdi). Ama fişin KENDİSİ okunamıyorsa o kayıt
   * kuyruktan düşer ve sıradakine geçilir — bozuk tek bir kayıt bütün kuyruğu
   * süresiz tıkayamaz.
   */
  async retryPending(): Promise<{ printed: number; remaining: number }> {
    let printed = 0;
    for (const job of queue.listPending(this.deps.db)) {
      const receipt = queue.readReceipt(this.deps.db, job.id);
      if (!receipt) {
        queue.remove(this.deps.db, job.id);
        continue;
      }

      let payload: Buffer;
      try {
        payload = renderReceipt(receipt, {
          codepage: this.deps.getConfig().printer.codepage,
          widthMm: this.deps.getWidthMm(),
          logo: this.logo(),
          copy: true,
        });
      } catch (error) {
        // Kayıt bozuk: bu iş HİÇBİR zaman basılamaz, kuyrukta tutmak boşuna.
        log('error', 'printer', 'bozuk fiş kaydı kuyruktan düşürüldü', {
          clientSaleId: job.clientSaleId,
          detail: error instanceof Error ? error.message : String(error),
        });
        queue.remove(this.deps.db, job.id);
        continue;
      }

      try {
        await this.send(payload);
        queue.remove(this.deps.db, job.id);
        printed += 1;
      } catch (error) {
        // Yazıcı hâlâ erişilemiyorsa kalan işleri denemek anlamsız; her biri
        // aynı zaman aşımını bir kez daha bekletirdi.
        const deviceError = toDeviceError(error, 'DEVICE_UNREACHABLE');
        log('warn', 'printer', 'kuyruktaki fiş yeniden basılamadı', {
          clientSaleId: job.clientSaleId,
          attempt: job.attempts + 1,
          code: deviceError.code,
        });
        queue.markAttempt(this.deps.db, job.id, deviceError.message, this.now());
        break;
      }
    }
    return { printed, remaining: this.pendingCount() };
  }

  discardPending(id: string): void {
    queue.remove(this.deps.db, id);
  }

  /**
   * Kağıt/kapak durumunu sorar.
   *
   * Yanıt vermeyen yazıcıda `null` döner: `DLE EOT` desteklemeyen modeller var ve
   * onlarda baskıyı engellemek, çalışan bir yazıcıyı kullanılamaz kılardı.
   */
  private async queryStatus(transport: Transport): Promise<PrinterStatus | null> {
    try {
      await transport.write(Buffer.concat([STATUS_QUERY_PRINTER, STATUS_QUERY_PAPER]));
      const response = await transport.read({
        timeoutMs: STATUS_TIMEOUT_MS,
        isComplete: (buffer) => buffer.length >= 2,
      });
      return decodePrinterStatus(response[0] ?? 0, response[1] ?? 0);
    } catch {
      return null;
    }
  }

  /** Ayarlar ekranındaki "Test fişi bas". Hata BURADA fırlatılır: amaç sınamak. */
  async printTest(): Promise<void> {
    await this.send(
      renderTestReceipt({
        codepage: this.deps.getConfig().printer.codepage,
        widthMm: this.deps.getWidthMm(),
      }),
    );
  }

  /** Para çekmecesini açar (yazıcı üzerinden darbe). */
  async openDrawer(): Promise<void> {
    await this.send(renderDrawerKick(this.deps.getConfig().printer.codepage));
  }

  /**
   * Baytları yazıcıya gönderir. Bağlantı iş başına açılıp kapanır; işler
   * sıraya alınır (`inFlight`).
   */
  private send(payload: Buffer, options: { checkStatus?: boolean } = {}): Promise<void> {
    const run = this.inFlight.then(async () => {
      const config = this.deps.getConfig().printer;
      if (!isConfigured(config.transport)) throw new DeviceError('DEVICE_NOT_CONFIGURED');

      const transport = await this.deps.openTransport(config.transport);
      try {
        if (options.checkStatus) {
          const status = await this.queryStatus(transport);
          if (status?.coverOpen) {
            throw new DeviceError(
              'DEVICE_NOT_READY',
              'kapak açık',
              'Yazıcının kapağı açık. Kapatıp tekrar deneyin.',
            );
          }
          if (status?.paperOut) {
            throw new DeviceError(
              'DEVICE_NOT_READY',
              'kağıt yok',
              'Yazıcıda kağıt bitti. Rulo takıp fişi yeniden basın.',
            );
          }
        }
        await transport.write(payload);
      } finally {
        await transport.close().catch(() => undefined);
      }
    });
    // Zincir kopmasın: bir iş hata verse de sıradaki denenebilmeli.
    this.inFlight = run.catch(() => undefined);
    return run;
  }
}
