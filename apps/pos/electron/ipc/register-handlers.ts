import type { BrowserWindow } from 'electron';
import { z } from 'zod';

import type { AppContext } from '../app-context';
import { assertChannelsRegistered, defineHandler } from './handler';
import { deviceConfigSchema } from '../hardware/device-config';
import { listSerialPorts } from '../hardware/transports';
import { AppError } from '../lib/app-error';
import { normalizeServerUrl } from '../services/config-store';
import type {
  AppInfo,
  CashSession,
  CatalogProduct,
  CompletedSale,
  ContactSummary,
  DeviceStatus,
  EventChannel,
  FailedSale,
  NetworkStatus,
  ParkedSale,
  PosConfig,
  PosSession,
  PosSettings,
  RecentSale,
  Register,
  ReturnResult,
  CustomerDisplayState,
  DeviceSettings,
  DisplayOption,
  FiscalResult,
  PosDeviceResult,
  PrintJob,
  PrintResult,
  SaleDraft,
  ScaleWeight,
  ScanResult,
  SerialPortOption,
  ShiftCloseResult,
  SyncRunResult,
  SyncStatus,
  UpdateStatus,
} from '../shared/ipc-contracts';

const urlSchema = z.object({ url: z.string().min(1).max(2048) }).strict();

const loginSchema = z
  .object({
    email: z.string().trim().min(1).max(255),
    password: z.string().min(1).max(200),
    totpCode: z.string().trim().min(6).max(8).optional(),
  })
  .strict();

const openShiftSchema = z
  .object({
    registerId: z.string().min(1).max(64),
    openingAmount: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'Geçerli bir tutar girin.'),
    note: z.string().max(300).optional(),
  })
  .strict();

const closeShiftSchema = z
  .object({
    closingAmount: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'Geçerli bir tutar girin.'),
    note: z.string().max(300).optional(),
  })
  .strict();

const selectRegisterSchema = z
  .object({ registerId: z.string().min(1).max(64), registerName: z.string().min(1).max(120) })
  .strict();

// --- satış ekranı şemaları ---------------------------------------------------
// Renderer güvenilmez taraftır: kanaldan geçen her şey burada strict doğrulanır.

const querySchema = z.object({ query: z.string().max(120) }).strict();
const barcodeSchema = z.object({ barcode: z.string().trim().min(1).max(64) }).strict();
const idSchema = z.object({ id: z.string().min(1).max(64) }).strict();

const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'Geçerli bir tutar girin.');
const quantity = z.string().regex(/^\d{1,9}(\.\d{1,3})?$/, 'Geçerli bir miktar girin.');
const rate = z.string().regex(/^\d{1,3}(\.\d{1,2})?$/, 'Geçerli bir oran girin.');

const paymentsSchema = z
  .array(
    z
      .object({
        method: z.enum(['CASH', 'CARD', 'CREDIT', 'TRANSFER']),
        amount: money,
        receivedAmount: money.optional(),
        reference: z.string().max(120).optional(),
      })
      .strict(),
  )
  .max(10);

const saleDraftSchema = z
  .object({
    lines: z
      .array(
        z
          .object({
            productId: z.string().min(1).max(64),
            name: z.string().min(1).max(200),
            quantity,
            unitPrice: money,
            vatRate: z.number().int().min(0).max(100),
            discountRate: rate.optional(),
            note: z.string().max(200).optional(),
          })
          .strict(),
      )
      .min(1, 'En az bir kalem gerekli.')
      .max(200),
    payments: paymentsSchema.min(1, 'En az bir ödeme gerekli.'),
    contactId: z.string().min(1).max(64).optional(),
    contactName: z.string().max(200).optional(),
    documentDiscountRate: rate.optional(),
    note: z.string().max(500).optional(),
  })
  .strict();

// Park edilen sepette henüz ödeme YOKTUR; ödeme listesi boş geçilebilir.
// Not: `min(1)`'i `extend` ile gevşetmek işe yaramaz — Zod kontrolleri değiştirmez,
// EKLER; bu yüzden kısıtsız `paymentsSchema` doğrudan kullanılıyor.
const parkSchema = z
  .object({
    label: z.string().trim().min(1).max(60),
    draft: saleDraftSchema.extend({ payments: paymentsSchema }),
  })
  .strict();

const returnSchema = z
  .object({
    saleId: z.string().min(1).max(64),
    refundMethod: z.enum(['CASH', 'CARD', 'CREDIT', 'TRANSFER']),
    reason: z.string().trim().min(1).max(300),
    items: z
      .array(z.object({ saleItemId: z.string().min(1).max(64), quantity }).strict())
      .min(1)
      .max(200),
  })
  .strict();

/** Durum sorgularında hatayı kasiyer diline çevirir; sorgu HATA fırlatmaz. */
function describeDeviceError(error: unknown): string {
  return error instanceof AppError ? error.message : 'Cihaz durumu okunamadı.';
}

const printReceiptSchema = z
  .object({ clientSaleId: z.string().min(1).max(64), copy: z.boolean().optional() })
  .strict();

const paySchema = z.object({ amount: money, referenceId: z.string().min(1).max(64) }).strict();

const referenceSchema = z.object({ referenceId: z.string().min(1).max(64) }).strict();

const displayStateSchema = z
  .object({
    lines: z
      .array(
        z
          .object({ name: z.string().max(200), quantity: z.string().max(20), lineTotal: money })
          .strict(),
      )
      .max(200),
    grandTotal: money,
    changeDue: money.nullable(),
    message: z.string().max(200).nullable(),
  })
  .strict();

/**
 * Tüm IPC kanallarını kaydeder ve main → renderer olaylarını pencereye bağlar.
 *
 * @returns olay aboneliklerini sonlandıran fonksiyon
 */
export function registerHandlers(context: AppContext, window: BrowserWindow): () => void {
  const emit = <T>(channel: EventChannel, payload: T): void => {
    if (!window.isDestroyed()) window.webContents.send(channel, payload);
  };

  /** Basılamamış fiş sayısı değişti — üst şerit rozeti bunu dinliyor. */
  const emitPrintQueue = (): void => {
    emit('event:print-queue', context.printer.pendingCount());
  };

  // --- system ---------------------------------------------------------------
  defineHandler<undefined, AppInfo>('system:app-info', null, () => ({
    appVersion: context.appVersion,
    electronVersion: process.versions.electron ?? '',
    chromeVersion: process.versions.chrome ?? '',
    platform: process.platform,
  }));

  defineHandler<undefined, PosConfig>('system:get-config', null, () => context.config.get());

  defineHandler<{ url: string }, PosConfig>('system:set-server-url', urlSchema, (input) => {
    const check = normalizeServerUrl(input.url);
    if (!check.ok) throw new AppError('INVALID_SERVER_URL', check.message);
    return context.config.patch({ serverUrl: check.url });
  });

  /**
   * Kurulum ekranı adresi KAYDETMEDEN dener: yanlış adres kaydedilip uygulamanın
   * açılışta ona takılması yerine, kullanıcı doğru adresi bulana kadar deneyebilsin.
   */
  defineHandler<{ url: string }, { reachable: boolean; service: string | null }>(
    'system:test-server',
    urlSchema,
    async (input) => {
      const check = normalizeServerUrl(input.url);
      if (!check.ok) throw new AppError('INVALID_SERVER_URL', check.message);
      try {
        const health = await context.api.probe(check.url);
        return { reachable: true, service: health };
      } catch {
        return { reachable: false, service: null };
      }
    },
  );

  defineHandler<undefined, NetworkStatus>('system:network-status', null, () =>
    context.network.check(),
  );

  defineHandler<undefined, UpdateStatus>(
    'system:update-status',
    null,
    () => context.updater.status,
  );

  // --- auth -----------------------------------------------------------------
  defineHandler<z.infer<typeof loginSchema>, PosSession>('auth:login', loginSchema, (input) =>
    context.auth.login({
      email: input.email,
      password: input.password,
      ...(input.totpCode === undefined ? {} : { totpCode: input.totpCode }),
    }),
  );

  defineHandler<undefined, null>('auth:logout', null, async () => {
    await context.auth.logout();
    return null;
  });

  defineHandler<undefined, PosSession | null>('auth:session', null, () => context.auth.session);

  // --- sync -----------------------------------------------------------------
  defineHandler<undefined, SyncStatus>('sync:status', null, () => context.sync.status());
  defineHandler<undefined, SyncRunResult>('sync:run', null, () => context.sync.runOnce());
  defineHandler<undefined, { requeued: number }>('sync:retry-failed', null, () =>
    context.sync.retryFailed(),
  );
  defineHandler<undefined, FailedSale[]>('sync:failed-sales', null, () =>
    context.sync.failedSales(),
  );

  // --- shift ----------------------------------------------------------------
  defineHandler<undefined, Register[]>('shift:registers', null, () =>
    context.shift.listRegisters(),
  );
  defineHandler<z.infer<typeof selectRegisterSchema>, PosConfig>(
    'shift:select-register',
    selectRegisterSchema,
    (input) => context.shift.rememberRegister(input.registerId, input.registerName),
  );
  defineHandler<undefined, CashSession | null>('shift:current', null, () =>
    context.shift.current(),
  );
  defineHandler<z.infer<typeof openShiftSchema>, CashSession>(
    'shift:open',
    openShiftSchema,
    (input) =>
      context.shift.open({
        registerId: input.registerId,
        openingAmount: input.openingAmount,
        ...(input.note === undefined ? {} : { note: input.note }),
      }),
  );

  /**
   * Vardiya kapanışı. Bekleyen satış sayısı RENDERER'DAN alınmaz — kuyruğun
   * gerçek durumu main process'te, orada okunuyor.
   */
  defineHandler<z.infer<typeof closeShiftSchema>, ShiftCloseResult>(
    'shift:close',
    closeShiftSchema,
    (input) =>
      context.shift.close(
        {
          closingAmount: input.closingAmount,
          ...(input.note === undefined ? {} : { note: input.note }),
        },
        context.sync.status().pendingCount,
      ),
  );

  // --- catalog (tamamı yerel önbellekten) -----------------------------------
  defineHandler<undefined, PosSettings | null>('catalog:settings', null, () =>
    context.catalog.settings(),
  );
  defineHandler<{ query: string }, CatalogProduct[]>('catalog:search', querySchema, (input) =>
    context.catalog.search(input.query),
  );
  defineHandler<{ barcode: string }, ScanResult>('catalog:scan', barcodeSchema, (input) =>
    context.catalog.scan(input.barcode),
  );

  // --- sale -----------------------------------------------------------------
  defineHandler<SaleDraft, CompletedSale>('sale:submit', saleDraftSchema, (input) =>
    context.sale.submit(input),
  );
  defineHandler<z.infer<typeof parkSchema>, ParkedSale>('sale:park', parkSchema, (input) =>
    context.sale.park(input),
  );
  defineHandler<undefined, ParkedSale[]>('sale:parked', null, () => context.sale.parked());
  defineHandler<{ id: string }, SaleDraft>('sale:unpark', idSchema, (input) =>
    context.sale.unpark(input.id),
  );
  defineHandler<{ id: string }, null>('sale:discard-parked', idSchema, (input) =>
    context.sale.discard(input.id),
  );
  defineHandler<{ query: string }, RecentSale[]>('sale:recent', querySchema, (input) =>
    context.sale.recent(input.query),
  );
  defineHandler<z.infer<typeof returnSchema>, ReturnResult>('sale:return', returnSchema, (input) =>
    context.sale.submitReturn(input),
  );

  // --- contacts -------------------------------------------------------------
  defineHandler<{ query: string }, ContactSummary[]>('contacts:search', querySchema, (input) =>
    context.contacts.search(input.query),
  );

  // --- donanım (Faz 14) -----------------------------------------------------
  //
  // Durum sorguları HATA FIRLATMAZ: kasiyer üst şeritte "bağlı değil" görmeli,
  // kırmızı bir hata kutusu değil. Asıl işlemler (yazdır, tart, ödeme) hatayı
  // Türkçe mesajla döndürür.

  defineHandler<undefined, DeviceStatus>('printer:status', null, () => ({
    connected: context.printer.configured,
    detail: context.printer.configured
      ? 'Yazıcı tanımlı.'
      : 'Yazıcı tanımlı değil. Ayarlar ekranından seçin.',
  }));

  /**
   * Fiş basar. Yazıcı yoksa/kağıt bittiyse HATA DÖNMEZ — iş kuyruğa alınır ve
   * `queued: true` döner; satış ekranı bunu uyarı olarak gösterir.
   */
  defineHandler<z.infer<typeof printReceiptSchema>, PrintResult>(
    'printer:print-receipt',
    printReceiptSchema,
    async (input) => {
      const sale = context.sale.receiptFor(input.clientSaleId);
      const result = await context.printer.printReceipt(sale.receipt, {
        copy: input.copy ?? true,
        cashSale: sale.cashSale,
      });
      emitPrintQueue();
      return result;
    },
  );

  defineHandler<undefined, null>('printer:test', null, async () => {
    await context.printer.printTest();
    return null;
  });

  defineHandler<undefined, PrintJob[]>('printer:pending', null, () => context.printer.pending());

  defineHandler<undefined, { printed: number; remaining: number }>(
    'printer:retry-pending',
    null,
    async () => {
      const result = await context.printer.retryPending();
      emitPrintQueue();
      return result;
    },
  );

  defineHandler<{ id: string }, null>('printer:discard-pending', idSchema, (input) => {
    context.printer.discardPending(input.id);
    emitPrintQueue();
    return null;
  });

  defineHandler<undefined, DeviceStatus>('scale:status', null, () => ({
    connected: context.scale.configured,
    detail: context.scale.configured
      ? 'Terazi tanımlı.'
      : 'Terazi tanımlı değil. Ayarlar ekranından seçin.',
  }));

  defineHandler<undefined, ScaleWeight>('scale:read', null, () => context.scale.read());

  defineHandler<undefined, DeviceStatus>('posDevice:status', null, async () => {
    try {
      const result = await context.posDevice().ping();
      return { connected: result.ok, detail: result.detail };
    } catch (error) {
      return { connected: false, detail: describeDeviceError(error) };
    }
  });

  defineHandler<z.infer<typeof paySchema>, PosDeviceResult>('posDevice:pay', paySchema, (input) =>
    context.posDevice().pay(input),
  );

  defineHandler<{ referenceId: string }, PosDeviceResult>(
    'posDevice:query',
    referenceSchema,
    (input) => context.posDevice().query(input.referenceId),
  );

  defineHandler<{ referenceId: string }, null>(
    'posDevice:cancel',
    referenceSchema,
    async (input) => {
      await context.posDevice().cancel(input.referenceId);
      return null;
    },
  );

  defineHandler<undefined, DeviceStatus>('cashDrawer:status', null, () => ({
    // Çekmece yazıcıya bağlıdır; kendi bağlantısı yoktur.
    connected: context.printer.configured,
    detail: context.printer.configured
      ? 'Çekmece yazıcı üzerinden açılıyor.'
      : 'Çekmece için önce yazıcı tanımlanmalı.',
  }));

  defineHandler<undefined, null>('cashDrawer:open', null, async () => {
    await context.printer.openDrawer();
    return null;
  });

  defineHandler<undefined, DeviceStatus>('fiscal:status', null, async () => {
    try {
      const result = await context.fiscal().ping();
      return { connected: result.ok, detail: result.detail };
    } catch (error) {
      return { connected: false, detail: describeDeviceError(error) };
    }
  });

  defineHandler<{ clientSaleId: string }, FiscalResult>(
    'fiscal:register',
    z.object({ clientSaleId: z.string().min(1).max(64) }).strict(),
    (input) => context.fiscal().registerSale(context.sale.receiptFor(input.clientSaleId).receipt),
  );

  // --- cihaz ayarları -------------------------------------------------------
  defineHandler<undefined, DeviceSettings>('devices:get', null, () => context.config.getDevices());

  defineHandler<DeviceSettings, DeviceSettings>('devices:set', deviceConfigSchema, (input) => {
    const saved = context.config.setDevices(input);
    // Müşteri ekranı ayarı değişmişse pencere hemen açılır/kapanır; kasiyer
    // uygulamayı yeniden başlatmak zorunda kalmasın.
    context.customerDisplay.applyConfig();
    return saved;
  });

  defineHandler<undefined, SerialPortOption[]>('devices:serial-ports', null, () =>
    listSerialPorts(),
  );

  defineHandler<undefined, DisplayOption[]>('devices:displays', null, () =>
    context.customerDisplay.displays(),
  );

  // --- müşteri ekranı -------------------------------------------------------
  defineHandler<CustomerDisplayState, null>('display:update', displayStateSchema, (input) => {
    context.customerDisplay.push(input);
    return null;
  });

  assertChannelsRegistered();

  // --- main → renderer ------------------------------------------------------
  const unsubscribes = [
    context.network.onChange((status) => emit('event:network-status', status)),
    context.sync.onChange((status) => emit('event:sync-status', status)),
    context.auth.onChange((session) => emit('event:session-changed', session)),
    context.updater.onChange((status) => emit('event:update-status', status)),
  ];

  return () => {
    for (const unsubscribe of unsubscribes) unsubscribe();
  };
}
