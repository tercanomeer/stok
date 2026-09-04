import { z } from 'zod';

import { ApiRequestError, type ApiClient } from './api-client';
import {
  countProducts,
  readLastPullAt,
  readPullCursor,
  replaceProducts,
  saveSettings,
  upsertProducts,
  writePullCursor,
  type CachedProduct,
} from '../db/cache-repo';
import { readMeta, writeMeta, type PosDatabase } from '../db/database';
import { markSaleFailed, markSaleSynced } from '../db/local-sale-repo';
import * as queue from '../db/queue-repo';
import { AppError } from '../lib/app-error';
import { log } from '../lib/logger';
import type { FailedSale, SyncPhase, SyncRunResult, SyncStatus } from '../shared/ipc-contracts';

/** Sunucu 200 kabul ediyor; 100 daha küçük yanıt gövdesi ve daha erken ilerleme demek. */
const PUSH_BATCH_SIZE = 100;
const LAST_PUSH_KEY = 'sync.lastPushAt';

/**
 * `/sync/pull` yanıtı. Bilinmeyen alanlar SESSİZCE atılır (strict değil): sunucuya
 * yeni bir alan eklendiğinde eski POS kurulumları çekişi kaybetmemeli. Tip uyuşmazlığı
 * ise hata verir — bozuk veriyi önbelleğe yazmaktansa çekişi atlamak yeğdir.
 */
const pullResponseSchema = z.object({
  serverTime: z.string(),
  products: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      salePrice: z.coerce.string(),
      vatRate: z.coerce.number(),
      stockQuantity: z.coerce.string(),
      trackStock: z.boolean(),
      isActive: z.boolean(),
      unitId: z.string(),
      updatedAt: z.string(),
      barcodes: z.array(z.object({ value: z.string() })),
    }),
  ),
  settings: z
    .object({
      vatRates: z.array(z.coerce.number()),
      defaultVatRate: z.coerce.number(),
      scaleBarcodePrefixes: z.array(z.string()),
      currency: z.string(),
      // Faz 13'te eklendi. Eski bir sunucuya bağlı kasa çekişi KAYBETMESİN diye
      // varsayılanlı: eşik sunucudaki varsayılanla, politika en gevşek olanla aynı.
      highDiscountThreshold: z.coerce.string().default('10.00'),
      negativeStockPolicy: z.enum(['ALLOW', 'WARN', 'BLOCK']).default('WARN'),
      receiptHeader: z.string().nullable().default(null),
      receiptFooter: z.string().nullable().default(null),
      receiptWidthMm: z.union([z.literal(58), z.literal(80)]).default(80),
      autoPrintReceipt: z.boolean().default(true),
    })
    .nullable(),
});

const pushResponseSchema = z.object({
  results: z.array(
    z.object({
      clientSaleId: z.string().nullable(),
      status: z.enum(['created', 'duplicate', 'error']),
      saleId: z.string().optional(),
      receiptNo: z.string().optional(),
      error: z.object({ code: z.string(), message: z.string() }).optional(),
    }),
  ),
});

/**
 * Hatayı kasiyere gösterilebilir hâle çevirir.
 *
 * Ham `error.message` (ECONNRESET, "fetch failed", yığın izi) ekrana çıkmaz:
 * bu metinler `sync_queue.last_error` üzerinden "gönderilemeyen satışlar"
 * ekranına kadar gidiyordu. Sunucunun kendi Türkçe mesajı (`ApiRequestError`)
 * anlamlıdır ve olduğu gibi geçer; gerisi tek bir cümleye indirgenir.
 */
function describeError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.kind === 'network' ? 'Sunucuya ulaşılamadı.' : error.message;
  }
  if (error instanceof AppError) return error.message;
  log('warn', 'sync', 'beklenmeyen senkronizasyon hatası', {
    detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
  });
  return 'Bağlantı hatası; tekrar denenecek.';
}

export interface SyncDeps {
  db: PosDatabase;
  api: ApiClient;
  /** Ağ yoksa tur hiç başlatılmaz; boşuna zaman aşımı beklenmez. */
  isOnline: () => boolean;
  intervalMs?: number;
  clock?: () => Date;
  random?: () => number;
}

/**
 * Senkronizasyon döngüsü.
 *
 * Açılışta TAM çekiş (silinen ürünler önbellekten ancak böyle düşer), sonrasında
 * `since` ile delta. Her turda önce çekiş sonra gönderim yapılır: kasiyerin gördüğü
 * fiyat mümkün olduğunca güncel olsun.
 *
 * Gönderim at-least-once'tır ve çift kayıt İKİ katmanda engellenir:
 *  1) `sync_queue`'daki UNIQUE(entity, entity_id) — aynı satış kuyruğa iki kez girmez,
 *  2) sunucudaki `clientSaleId` benzersizliği — aynı satış ikinci kez gelirse mevcut
 *     satış döner, yeni kayıt açılmaz.
 */
export class SyncService {
  private phase: SyncPhase = 'idle';
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<SyncRunResult> | null = null;
  private lastError: string | null = null;
  private listeners = new Set<(status: SyncStatus) => void>();

  constructor(private readonly deps: SyncDeps) {}

  private now(): Date {
    return (this.deps.clock ?? (() => new Date()))();
  }

  onChange(listener: (status: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setPhase(phase: SyncPhase): void {
    this.phase = phase;
    this.emit();
  }

  private emit(): void {
    if (this.listeners.size === 0) return;
    const status = this.status();
    for (const listener of this.listeners) listener(status);
  }

  status(): SyncStatus {
    const { pending, failed } = queue.counts(this.deps.db);
    return {
      phase: this.phase,
      lastPullAt: readLastPullAt(this.deps.db),
      lastPushAt: readMeta(this.deps.db, LAST_PUSH_KEY),
      pendingCount: pending,
      failedCount: failed,
      cachedProductCount: countProducts(this.deps.db),
      lastError: this.lastError,
    };
  }

  failedSales(): FailedSale[] {
    return queue.listFailed(this.deps.db);
  }

  retryFailed(): { requeued: number } {
    const requeued = queue.requeueFailed(this.deps.db, this.now());
    this.lastError = null;
    this.emit();
    return { requeued };
  }

  /** 30 sn'lik arka plan döngüsü (03-mimari.md). */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.runOnce(), this.deps.intervalMs ?? 30_000);
    this.timer.unref?.();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Tek tur. Aynı anda ikinci tur BAŞLAMAZ — çakışan iki tur aynı kuyruk satırlarını
   * ikinci kez gönderir; sunucu idempotent olsa da gereksiz trafik ve yanıltıcı
   * deneme sayacı üretirdi. Çağıran, süren turun sonucunu bekler.
   */
  async runOnce(options: { full?: boolean } = {}): Promise<SyncRunResult> {
    if (this.inFlight) return this.inFlight;
    if (!this.deps.isOnline()) return { pulled: 0, pushed: 0, failed: 0, skipped: true };

    this.inFlight = this.run(options.full ?? false).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  /**
   * Çekiş ve gönderim BİRBİRİNDEN BAĞIMSIZ iki adımdır.
   *
   * Katalog çekişi patlarsa (sunucuda yeni bir alan, geçici 500, zaman aşımı)
   * kuyruktaki ödenmiş satışlar yine de gönderilir — para hareketini katalog
   * tazeliğine bağlamak kabul edilemez. Bu yüzden iki ayrı `try/catch` var ve
   * `lastError` hangi adımın düştüğünü söyler.
   */
  private async run(full: boolean): Promise<SyncRunResult> {
    let pulled = 0;
    let pushed = 0;
    let failed = 0;
    const errors: string[] = [];

    try {
      this.setPhase('pulling');
      pulled = await this.pull(full);
    } catch (error) {
      errors.push(`Katalog çekilemedi: ${describeError(error)}`);
    }

    try {
      this.setPhase('pushing');
      const result = await this.push();
      pushed = result.pushed;
      failed = result.failed;
    } catch (error) {
      errors.push(`Satışlar gönderilemedi: ${describeError(error)}`);
    }

    this.lastError = errors.length > 0 ? errors.join(' ') : null;
    this.setPhase('idle');
    return { pulled, pushed, failed, skipped: false };
  }

  /** Katalog çekişi. `full` ise önbellek baştan yazılır, değilse `since` ile delta. */
  private async pull(full: boolean): Promise<number> {
    const cursor = full ? null : readPullCursor(this.deps.db);
    const raw = await this.deps.api.request<unknown>('/sync/pull', {
      query: cursor ? { since: cursor } : {},
    });

    const parsed = pullResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ApiRequestError(
        'protocol',
        'INVALID_PULL_PAYLOAD',
        'Sunucudan gelen katalog verisi okunamadı.',
      );
    }

    const products: CachedProduct[] = parsed.data.products.map((product) => ({
      id: product.id,
      name: product.name,
      salePrice: product.salePrice,
      vatRate: product.vatRate,
      stockQuantity: product.stockQuantity,
      trackStock: product.trackStock,
      isActive: product.isActive,
      unitId: product.unitId,
      updatedAt: product.updatedAt,
      barcodes: product.barcodes.map((barcode) => barcode.value),
    }));

    if (full) replaceProducts(this.deps.db, products);
    else upsertProducts(this.deps.db, products);

    const now = this.now().toISOString();
    if (parsed.data.settings) saveSettings(this.deps.db, parsed.data.settings, now);
    writePullCursor(this.deps.db, parsed.data.serverTime, now);
    return products.length;
  }

  /** Kuyrukta bekleyen satışları TEK istekte gönderir; sonucu kalem kalem işler. */
  private async push(): Promise<{ pushed: number; failed: number }> {
    const now = this.now();
    const rows = queue.claimDue(this.deps.db, now, PUSH_BATCH_SIZE);
    if (rows.length === 0) return { pushed: 0, failed: 0 };

    const sales = rows.map((row) => JSON.parse(row.payload) as unknown);

    let response: unknown;
    try {
      response = await this.deps.api.request<unknown>('/sync/sales', {
        method: 'POST',
        body: { sales },
      });
    } catch (error) {
      // İstek hiç ulaşmadıysa da ulaşıp reddedildiyse de kayıtlar kuyrukta kalır;
      // deneme sayacı artar, bir sonraki deneme geriye ötelenir. Kuyruğa yazılan
      // mesaj kasiyere gösterildiği için ham sürücü metni DEĞİL (bkz. describeError).
      const message = describeError(error);
      for (const row of rows) this.retry(row, message, now);
      this.emit();
      throw error;
    }

    const parsed = pushResponseSchema.safeParse(response);
    if (!parsed.success) {
      for (const row of rows) this.retry(row, 'Sunucu yanıtı okunamadı.', now);
      this.emit();
      throw new ApiRequestError(
        'protocol',
        'INVALID_PUSH_PAYLOAD',
        'Sunucudan gelen gönderim sonucu okunamadı.',
      );
    }

    const byClientId = new Map(
      parsed.data.results
        .filter((result) => result.clientSaleId !== null)
        .map((result) => [result.clientSaleId as string, result]),
    );

    const synced: number[] = [];
    let failed = 0;

    const apply = this.deps.db.transaction(() => {
      for (const row of rows) {
        const result = byClientId.get(row.entityId);
        // Yanıtta karşılığı olmayan satır: sunucunun onu işlediğini VARSAYMA, tekrar dene.
        if (!result || result.status === 'error') {
          const message = result?.error?.message ?? 'Sunucu bu satışı işlemedi.';
          if (this.retry(row, message, now)) failed += 1;
          continue;
        }
        // 'duplicate' = sunucuda zaten var (idempotent tekrar gönderim) → başarılı sayılır.
        synced.push(row.id);
        markSaleSynced(this.deps.db, row.entityId, {
          ...(result.saleId === undefined ? {} : { saleId: result.saleId }),
          ...(result.receiptNo === undefined ? {} : { receiptNo: result.receiptNo }),
        });
      }
      queue.markSynced(this.deps.db, synced, now);
      writeMeta(this.deps.db, LAST_PUSH_KEY, now.toISOString());
    });
    apply();

    this.emit();
    return { pushed: synced.length, failed };
  }

  /** @returns kayıt kalıcı hata kuyruğuna düştüyse true */
  private retry(row: queue.QueueRow, message: string, now: Date): boolean {
    const exhausted = queue.markRetry(this.deps.db, {
      id: row.id,
      attempts: row.attempts,
      error: message,
      now,
      ...(this.deps.random === undefined ? {} : { random: this.deps.random }),
    });
    if (exhausted) markSaleFailed(this.deps.db, row.entityId);
    return exhausted;
  }
}
