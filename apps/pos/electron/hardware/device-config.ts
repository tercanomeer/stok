import { z } from 'zod';

import type { DeviceSettings } from '../shared/ipc-contracts';
import type { Codepage } from './escpos/encoder';
import type { TransportConfig } from './transport';

/**
 * Kasa PC'sine bağlı cihazların ayarları.
 *
 * Bunlar tenant ayarı DEĞİL makine ayarıdır: hangi COM portu, hangi IP, hangi kod
 * sayfası — aynı işletmenin iki kasasında farklı olabilir. Bu yüzden sunucuya
 * gitmez, `config.json` içinde durur (`ConfigStore`).
 *
 * Tenant tarafında duran şey POLİTİKADIR: fiş genişliği, otomatik basım, fiş
 * başlığı — bunlar `/sync/pull` ile gelir ve tüm kasalarda aynıdır.
 */
export const CODEPAGES = ['CP857', 'CP1254'] as const;

const transportSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('serial'),
    path: z.string().min(1).max(200),
    baudRate: z.number().int().min(1200).max(921_600),
  }),
  z.object({
    kind: z.literal('network'),
    host: z.string().min(1).max(255),
    port: z.number().int().min(1).max(65_535),
  }),
  z.object({ kind: z.literal('none') }),
]);

export const deviceConfigSchema = z
  .object({
    printer: z
      .object({
        transport: transportSchema,
        codepage: z.enum(CODEPAGES),
        /** Nakit satışta çekmece darbesi gönderilsin mi. */
        openDrawerOnCashSale: z.boolean(),
        /**
         * Fişin üstüne basılacak logo dosyası (kasa PC'sinde).
         *
         * Tenant ayarındaki `logoUrl` kullanılamaz: özel bir kovada duruyor ve
         * kasa çevrimdışıyken indirilemez. Logo makineye kopyalanır.
         */
        logoPath: z.string().max(500).nullable(),
      })
      .strict(),
    scale: z
      .object({
        transport: transportSchema,
        /** Terazinin konuştuğu ASCII protokolü. */
        protocol: z.enum(['auto', 'toledo', 'cas', 'generic']),
      })
      .strict(),
    customerDisplay: z
      .object({
        enabled: z.boolean(),
        /** Ekranın Electron `display.id`'si; yoksa birincil olmayan ilk ekran. */
        displayId: z.number().nullable(),
      })
      .strict(),
    posDevice: z
      .object({
        /** `mock` gerçek SDK gelene kadar; sözleşme imzalanınca yeni değer eklenir. */
        driver: z.enum(['none', 'mock']),
      })
      .strict(),
    fiscal: z
      .object({
        driver: z.enum(['none', 'mock']),
      })
      .strict(),
  })
  .strict();

export type DeviceConfig = z.infer<typeof deviceConfigSchema>;

/**
 * Zod şeması ile renderer'a giden sözleşme tipinin BİREBİR aynı kalmasını zorlar.
 *
 * İki tanım ayrı dosyalarda duruyor (biri çalışma anı doğrulaması, diğeri
 * renderer'ın gördüğü tip). TypeScript'in yapısal tiplemesi tek yönde sessiz
 * kalıyordu: şemaya alan eklenip sözleşmeye eklenmezse derleme geçiyor ama alan
 * renderer'a HİÇ ulaşmıyordu. Aşağıdaki çift yönlü kontrol bu sessizliği kapatır.
 */
type MutuallyAssignable<A extends B, B extends C, C = A> = true;

/** Sözleşme ile şema ayrışırsa BURASI derlenmez. */
export const DEVICE_CONFIG_MATCHES_CONTRACT: MutuallyAssignable<DeviceConfig, DeviceSettings> =
  true;

export const DEFAULT_DEVICE_CONFIG: DeviceConfig = {
  // Hiçbir cihaz varsayılmaz: tanımsız bir yazıcıya yazmaya çalışmak, kasiyere
  // her satışta anlamsız bir hata göstermek demek olurdu.
  printer: {
    transport: { kind: 'none' },
    codepage: 'CP857',
    openDrawerOnCashSale: true,
    logoPath: null,
  },
  scale: { transport: { kind: 'none' }, protocol: 'auto' },
  customerDisplay: { enabled: false, displayId: null },
  posDevice: { driver: 'none' },
  fiscal: { driver: 'none' },
};

/** Yazıcı/terazi bağlantısı gerçekten tanımlı mı. */
export function isConfigured(transport: TransportConfig): boolean {
  return transport.kind !== 'none';
}

export type { Codepage };
