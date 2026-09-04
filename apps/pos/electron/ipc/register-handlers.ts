import type { BrowserWindow } from 'electron';
import { z } from 'zod';

import type { AppContext } from '../app-context';
import { assertChannelsRegistered, defineHandler } from './handler';
import { AppError, NotImplementedError } from '../lib/app-error';
import { normalizeServerUrl } from '../services/config-store';
import type {
  AppInfo,
  CashSession,
  DeviceStatus,
  EventChannel,
  FailedSale,
  NetworkStatus,
  PosConfig,
  PosSession,
  Register,
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

const selectRegisterSchema = z
  .object({ registerId: z.string().min(1).max(64), registerName: z.string().min(1).max(120) })
  .strict();

const saleIdSchema = z.object({ saleId: z.string().min(1).max(64) }).strict();
const amountSchema = z.object({ amount: z.string().min(1).max(20) }).strict();

/** Faz 14'e kadar donanım kanallarının verdiği yanıt. */
function offlineDevice(detail: string): DeviceStatus {
  return { connected: false, detail };
}

/**
 * Tüm IPC kanallarını kaydeder ve main → renderer olaylarını pencereye bağlar.
 *
 * @returns olay aboneliklerini sonlandıran fonksiyon
 */
export function registerHandlers(context: AppContext, window: BrowserWindow): () => void {
  const emit = <T>(channel: EventChannel, payload: T): void => {
    if (!window.isDestroyed()) window.webContents.send(channel, payload);
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

  // --- donanım (Faz 14) -----------------------------------------------------
  defineHandler<undefined, DeviceStatus>('printer:status', null, () =>
    offlineDevice('Fiş yazıcısı Faz 14’te bağlanacak.'),
  );
  defineHandler<z.infer<typeof saleIdSchema>, never>('printer:print-receipt', saleIdSchema, () => {
    throw new NotImplementedError('Fiş yazdırma');
  });

  defineHandler<undefined, DeviceStatus>('scale:status', null, () =>
    offlineDevice('Terazi Faz 14’te bağlanacak.'),
  );
  defineHandler<undefined, never>('scale:read', null, () => {
    throw new NotImplementedError('Terazi okuma');
  });

  defineHandler<undefined, DeviceStatus>('posDevice:status', null, () =>
    offlineDevice('POS cihazı Faz 14’te bağlanacak.'),
  );
  defineHandler<z.infer<typeof amountSchema>, never>('posDevice:pay', amountSchema, () => {
    throw new NotImplementedError('POS cihazıyla ödeme');
  });

  defineHandler<undefined, DeviceStatus>('cashDrawer:status', null, () =>
    offlineDevice('Para çekmecesi Faz 14’te bağlanacak.'),
  );
  defineHandler<undefined, never>('cashDrawer:open', null, () => {
    throw new NotImplementedError('Para çekmecesi açma');
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
