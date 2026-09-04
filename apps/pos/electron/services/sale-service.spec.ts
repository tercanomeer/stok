import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { PERMISSIONS } from '@stokk/types';

import { ApiClient, type TokenStore } from './api-client';
import type { AuthService } from './auth-service';
import { ConfigStore } from './config-store';
import { SaleService } from './sale-service';
import { ShiftService } from './shift-service';
import { SyncService } from './sync-service';
import { saveSettings, upsertProducts } from '../db/cache-repo';
import { openDatabase, type PosDatabase } from '../db/database';
import { findLocalSale } from '../db/local-sale-repo';
import { counts } from '../db/queue-repo';
import type { CashSession, PosSession, SaleDraft } from '../shared/ipc-contracts';

const NOW = new Date('2026-09-04T10:00:00.000Z');

const SHIFT: CashSession = {
  id: 'cs1',
  registerId: 'r1',
  status: 'OPEN',
  openingAmount: '100.00',
  openedAt: '2026-09-04T08:00:00.000Z',
};

const noTokens: TokenStore = { read: () => null, write: () => undefined, clear: () => undefined };

function session(permissions: string[] = [PERMISSIONS.SALE_CREATE]): PosSession {
  return {
    user: {
      id: 'u1',
      tenantId: 't1',
      email: 'kasiyer@stokk.test',
      fullName: 'Kasiyer Ali',
      permissions,
      roles: ['KASIYER'],
    },
    offline: false,
    lastOnlineLoginAt: NOW.toISOString(),
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requestUrl(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (input instanceof Request) return input.url;
  return '';
}

/** Gönderilen istek gövdesinden satış kimliklerini tip güvenli okur. */
function pushedSaleIds(init: RequestInit | undefined): string[] {
  // `RequestInit.body` Blob/stream de olabilir; testte her zaman JSON string.
  const raw = typeof init?.body === 'string' ? init.body : '{}';
  const parsed: unknown = JSON.parse(raw);
  const sales = (parsed as { sales?: { clientSaleId?: unknown }[] }).sales ?? [];
  return sales
    .map((sale) => sale.clientSaleId)
    .filter((id): id is string => typeof id === 'string');
}

function draft(overrides: Partial<SaleDraft> = {}): SaleDraft {
  return {
    lines: [{ productId: 'p1', name: 'Ekmek', quantity: '2', unitPrice: '10.00', vatRate: 1 }],
    payments: [{ method: 'CASH', amount: '20.00' }],
    ...overrides,
  };
}

interface Harness {
  db: PosDatabase;
  sale: SaleService;
  shift: ShiftService;
  fetchImpl: Mock<typeof fetch>;
  setSession: (next: PosSession | null) => void;
}

let tempDir: string;

function harness(options: { online?: boolean; shift?: CashSession | null } = {}): Harness {
  const online = options.online ?? true;
  const db = openDatabase(':memory:');
  const fetchImpl: Mock<typeof fetch> = vi.fn();
  const api = new ApiClient({
    getBaseUrl: () => 'https://api.test',
    tokens: noTokens,
    fetchImpl,
  });
  const config = new ConfigStore(path.join(tempDir, `${Math.random()}.json`));
  config.patch({ registerId: 'r1', registerName: 'Kasa 1' });

  const shift = new ShiftService(api, config, db, () => online);
  if (options.shift !== null) {
    // `current()` sunucuya sorar; testte açık vardiyayı doğrudan yerele yazıyoruz.
    (shift as unknown as { remember: (value: CashSession) => void }).remember(
      options.shift ?? SHIFT,
    );
  }

  let current: PosSession | null = session();
  const auth = {
    get session(): PosSession | null {
      return current;
    },
  } as AuthService;

  const sync = new SyncService({ db, api, isOnline: () => online, clock: () => NOW });
  const sale = new SaleService({
    db,
    api,
    auth,
    shift,
    sync,
    config,
    isOnline: () => online,
    clock: () => NOW,
  });

  return {
    db,
    sale,
    shift,
    fetchImpl,
    setSession: (next) => {
      current = next;
    },
  };
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stokk-pos-sale-'));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('SaleService — satış gönderimi', () => {
  it('çevrimiçi satış hemen gönderilir ve fiş numarası döner', async () => {
    const h = harness();
    // Sunucu, gövdede gelen `clientSaleId`'yi aynen geri veriyor — gerçek akışta da öyle.
    h.fetchImpl.mockImplementation((url, init) =>
      Promise.resolve(
        requestUrl(url).includes('/sync/sales')
          ? jsonResponse({
              ok: true,
              data: {
                results: pushedSaleIds(init).map((clientSaleId) => ({
                  clientSaleId,
                  status: 'created',
                  saleId: 's1',
                  receiptNo: 'F-1',
                })),
              },
            })
          : jsonResponse({
              ok: true,
              data: { serverTime: NOW.toISOString(), products: [], settings: null },
            }),
      ),
    );

    const result = await h.sale.submit(draft());

    expect(result.synced).toBe(true);
    expect(result.receipt.receiptNo).toBe('F-1');
    expect(result.grandTotal).toBe('20.00');
    expect(counts(h.db)).toEqual({ pending: 0, failed: 0 });
  });

  it('çevrimdışı satış yerele yazılır ve KUYRUKTA bekler', async () => {
    const h = harness({ online: false });

    const result = await h.sale.submit(draft());

    expect(h.fetchImpl).not.toHaveBeenCalled();
    expect(result.synced).toBe(false);
    expect(result.receipt.receiptNo).toBeNull();
    expect(counts(h.db)).toEqual({ pending: 1, failed: 0 });
    expect(findLocalSale(h.db, result.clientSaleId)?.status).toBe('PENDING');
  });

  it('gönderim patlasa bile satış KAYBOLMAZ', async () => {
    const h = harness();
    h.fetchImpl.mockRejectedValue(new Error('ECONNRESET'));

    const result = await h.sale.submit(draft());

    expect(result.synced).toBe(false);
    expect(counts(h.db)).toEqual({ pending: 1, failed: 0 });
  });

  it('para üstü nakit parçadan hesaplanır', async () => {
    const h = harness({ online: false });

    const result = await h.sale.submit(
      draft({
        payments: [{ method: 'CASH', amount: '20.00', receivedAmount: '50.00' }],
      }),
    );

    expect(result.changeDue).toBe('30.00');
    expect(result.receipt.changeDue).toBe('30.00');
  });

  it('ödeme fişi kapatmıyorsa satış YAZILMAZ', async () => {
    const h = harness({ online: false });

    await expect(
      h.sale.submit(draft({ payments: [{ method: 'CASH', amount: '19.00' }] })),
    ).rejects.toThrow(/karşılamıyor/);
    expect(counts(h.db)).toEqual({ pending: 0, failed: 0 });
  });

  it('veresiyede müşteri zorunlu', async () => {
    const h = harness({ online: false });

    await expect(
      h.sale.submit(draft({ payments: [{ method: 'CREDIT', amount: '20.00' }] })),
    ).rejects.toThrow(/müşteri/i);
  });

  it('açık vardiya yoksa satış reddedilir', async () => {
    const h = harness({ online: false, shift: null });

    await expect(h.sale.submit(draft())).rejects.toThrow(/vardiya/i);
  });

  it('oturum kapalıysa satış reddedilir', async () => {
    const h = harness({ online: false });
    h.setSession(null);

    await expect(h.sale.submit(draft())).rejects.toThrow(/Oturum/);
  });

  it('fiş verisi çevrimdışında da üretilir', async () => {
    const h = harness({ online: false });
    saveSettings(
      h.db,
      {
        vatRates: [1, 10, 20],
        defaultVatRate: 20,
        scaleBarcodePrefixes: [],
        currency: 'TRY',
        highDiscountThreshold: '10.00',
        negativeStockPolicy: 'WARN',
        receiptHeader: 'STOKK MARKET',
        receiptFooter: 'Teşekkürler',
      },
      NOW.toISOString(),
    );

    const { receipt } = await h.sale.submit(draft());

    expect(receipt.header).toBe('STOKK MARKET');
    expect(receipt.footer).toBe('Teşekkürler');
    expect(receipt.registerName).toBe('Kasa 1');
    expect(receipt.cashierName).toBe('Kasiyer Ali');
    expect(receipt.lines).toEqual([
      { name: 'Ekmek', quantity: '2', unitPrice: '10.00', lineTotal: '20.00', vatRate: 1 },
    ]);
  });
});

describe('SaleService — indirim yetkisi', () => {
  function withThreshold(h: Harness, threshold: string): void {
    saveSettings(
      h.db,
      {
        vatRates: [1],
        defaultVatRate: 1,
        scaleBarcodePrefixes: [],
        currency: 'TRY',
        highDiscountThreshold: threshold,
        negativeStockPolicy: 'WARN',
        receiptHeader: null,
        receiptFooter: null,
      },
      NOW.toISOString(),
    );
  }

  const discounted = draft({
    lines: [
      {
        productId: 'p1',
        name: 'Ekmek',
        quantity: '1',
        unitPrice: '100.00',
        vatRate: 1,
        discountRate: '20',
      },
    ],
    payments: [{ method: 'CASH', amount: '80.00' }],
  });

  it('eşiği aşan indirim YETKİSİZ kasiyerde reddedilir', async () => {
    const h = harness({ online: false });
    withThreshold(h, '10.00');

    await expect(h.sale.submit(discounted)).rejects.toThrow(/indirim yetkiniz yok/);
    expect(counts(h.db)).toEqual({ pending: 0, failed: 0 });
  });

  it('yetkili kullanıcıda geçer', async () => {
    const h = harness({ online: false });
    withThreshold(h, '10.00');
    h.setSession(session([PERMISSIONS.SALE_CREATE, PERMISSIONS.SALE_DISCOUNT_HIGH]));

    await expect(h.sale.submit(discounted)).resolves.toMatchObject({ grandTotal: '80.00' });
  });

  it('eşiğin altındaki indirim yetki istemez', async () => {
    const h = harness({ online: false });
    withThreshold(h, '25.00');

    await expect(h.sale.submit(discounted)).resolves.toMatchObject({ grandTotal: '80.00' });
  });
});

describe('SaleService — negatif stok politikası', () => {
  function seed(h: Harness, policy: 'ALLOW' | 'WARN' | 'BLOCK', stock: string, track = true): void {
    saveSettings(
      h.db,
      {
        vatRates: [1],
        defaultVatRate: 1,
        scaleBarcodePrefixes: [],
        currency: 'TRY',
        highDiscountThreshold: '10.00',
        negativeStockPolicy: policy,
        receiptHeader: null,
        receiptFooter: null,
      },
      NOW.toISOString(),
    );
    upsertProducts(h.db, [
      {
        id: 'p1',
        name: 'Ekmek',
        salePrice: '10.00',
        vatRate: 1,
        stockQuantity: stock,
        trackStock: track,
        isActive: true,
        unitId: 'u1',
        updatedAt: NOW.toISOString(),
        barcodes: [],
      },
    ]);
  }

  it('BLOCK politikasında stok yetmiyorsa satış KASADA reddedilir', async () => {
    // Sunucu da reddeder ama çevrimdışında bu red saatler sonra gelir; mal o
    // ana kadar verilmiş olur.
    const h = harness({ online: false });
    seed(h, 'BLOCK', '1');

    await expect(h.sale.submit(draft())).rejects.toThrow(/yeterli stok yok/);
    expect(counts(h.db)).toEqual({ pending: 0, failed: 0 });
  });

  it('BLOCK politikasında aynı ürünün İKİ satırı toplanarak ölçülür', async () => {
    const h = harness({ online: false });
    seed(h, 'BLOCK', '3');

    const twoLines = draft({
      lines: [
        { productId: 'p1', name: 'Ekmek', quantity: '2', unitPrice: '10.00', vatRate: 1 },
        {
          productId: 'p1',
          name: 'Ekmek',
          quantity: '2',
          unitPrice: '10.00',
          vatRate: 1,
          discountRate: '5',
        },
      ],
      payments: [{ method: 'CASH', amount: '39.00' }],
    });

    await expect(h.sale.submit(twoLines)).rejects.toThrow(/yeterli stok yok/);
  });

  it('WARN politikasında satış geçer', async () => {
    const h = harness({ online: false });
    seed(h, 'WARN', '1');

    await expect(h.sale.submit(draft())).resolves.toMatchObject({ grandTotal: '20.00' });
  });

  it('stok takibi kapalı ürün BLOCK politikasından etkilenmez', async () => {
    const h = harness({ online: false });
    seed(h, 'BLOCK', '0', false);

    await expect(h.sale.submit(draft())).resolves.toMatchObject({ grandTotal: '20.00' });
  });

  it('ayar hiç gelmemişse kapı çalışmaz, satış geçer', async () => {
    const h = harness({ online: false });
    await expect(h.sale.submit(draft())).resolves.toMatchObject({ grandTotal: '20.00' });
  });
});

describe('SaleService — park', () => {
  it('park eder, listeler ve geri alır', () => {
    const h = harness({ online: false });

    const parked = h.sale.park({ label: 'Ahmet', draft: draft() });
    expect(h.sale.parked()).toHaveLength(1);
    expect(parked.grandTotal).toBe('20.00');

    expect(h.sale.unpark(parked.id).lines).toHaveLength(1);
    expect(h.sale.parked()).toHaveLength(0);
  });

  it('boş sepet park edilemez', () => {
    const h = harness({ online: false });
    expect(() => h.sale.park({ label: 'boş', draft: { lines: [], payments: [] } })).toThrow(
      /Boş sepet/,
    );
  });

  it('olmayan park kaydı hata verir', () => {
    const h = harness({ online: false });
    expect(() => h.sale.unpark('yok')).toThrow(/bulunamadı/);
    expect(() => h.sale.discard('yok')).toThrow(/bulunamadı/);
  });
});

describe('ShiftService — vardiya kapanışı', () => {
  it('kuyrukta satış varken kapanış ENGELLENİR', async () => {
    // Ağ var ama gönderim düştü: satış kuyrukta kaldı. Bu durumda kapanış
    // yapılırsa beklenen nakit eksik hesaplanır ve kasiyer haksız yere fark görür.
    const h = harness();
    h.fetchImpl.mockRejectedValue(new Error('ECONNRESET'));
    await h.sale.submit(draft());
    expect(counts(h.db)).toEqual({ pending: 1, failed: 0 });

    await expect(h.shift.close({ closingAmount: '300.00' }, 1)).rejects.toThrow(/eşitleyin/);
  });

  it('çevrimdışıyken kapanış denenmez', async () => {
    const h = harness({ online: false });
    await expect(h.shift.close({ closingAmount: '300.00' }, 0)).rejects.toThrow(/internet/);
    expect(h.fetchImpl).not.toHaveBeenCalled();
  });

  it('açık vardiya yoksa kapanış reddedilir', async () => {
    const h = harness({ shift: null });
    await expect(h.shift.close({ closingAmount: '300.00' }, 0)).rejects.toThrow(/bulunamadı/);
  });

  it('kapanışta fark sunucudan gelir ve yerel vardiya kaydı DÜŞER', async () => {
    const h = harness();
    h.fetchImpl.mockResolvedValue(
      jsonResponse({
        ok: true,
        data: {
          session: {
            closingAmount: '300.00',
            expectedAmount: '320.00',
            differenceAmount: '-20.00',
            closedAt: NOW.toISOString(),
          },
          overThreshold: true,
        },
      }),
    );

    const result = await h.shift.close({ closingAmount: '300.00', note: 'sayım' }, 0);

    expect(result).toEqual({
      closingAmount: '300.00',
      expectedAmount: '320.00',
      differenceAmount: '-20.00',
      overThreshold: true,
      closedAt: NOW.toISOString(),
    });
    // Vardiya kapandı: yerel kayıt silindi, yeni satış kabul edilmez.
    expect(h.shift.active).toBeNull();
    await expect(h.sale.submit(draft())).rejects.toThrow(/vardiya/i);
  });
});

describe('SaleService — iade', () => {
  it('çevrimdışıyken iade ekranı veri getirmez', async () => {
    const h = harness({ online: false });
    await expect(h.sale.recent('')).rejects.toThrow(/internet/);
    await expect(
      h.sale.submitReturn({
        saleId: 's1',
        refundMethod: 'CASH',
        reason: 'bozuk',
        items: [{ saleItemId: 'i1', quantity: '1' }],
      }),
    ).rejects.toThrow(/internet/);
  });
});
