import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { ApiClient, type TokenStore } from './api-client';
import { SyncService } from './sync-service';
import { openDatabase, type PosDatabase } from '../db/database';
import { findLocalSale, saveLocalSale, type LocalSaleInput } from '../db/local-sale-repo';
import { claimDue, counts } from '../db/queue-repo';

const NOW = new Date('2026-09-03T10:00:00.000Z');

const noTokens: TokenStore = { read: () => null, write: () => undefined, clear: () => undefined };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function pullBody(products: unknown[], serverTime = '2026-09-03T10:00:00.000Z'): unknown {
  return {
    ok: true,
    data: {
      serverTime,
      products,
      settings: {
        vatRates: [1, 10, 20],
        defaultVatRate: 20,
        scaleBarcodePrefixes: ['27'],
        currency: 'TRY',
      },
    },
  };
}

function serverProduct(id = 'p1', overrides: Record<string, unknown> = {}): unknown {
  return {
    id,
    name: 'Ekmek',
    // Prisma Decimal JSON'a string olarak iner — istemci bunu string bekler.
    salePrice: '10.00',
    vatRate: 1,
    stockQuantity: '25',
    trackStock: true,
    isActive: true,
    unitId: 'u1',
    updatedAt: '2026-09-01T10:00:00.000Z',
    barcodes: [{ value: '8690000000001' }],
    ...overrides,
  };
}

function saleInput(): LocalSaleInput {
  return {
    cashSessionId: 'cs1',
    soldAt: '2026-09-03T09:59:00.000Z',
    lines: [{ productId: 'p1', name: 'Ekmek', quantity: '1', unitPrice: '10.00', vatRate: 1 }],
    payments: [{ method: 'CASH', amount: '10.00' }],
  };
}

type FetchMock = Mock<typeof fetch>;

/** `fetch` üç farklı girdi tipi kabul eder; testlerde her zaman string geçiyoruz. */
function requestUrl(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (input instanceof Request) return input.url;
  return '';
}

interface Harness {
  db: PosDatabase;
  sync: SyncService;
  fetchImpl: FetchMock;
}

function harness(online = true): Harness {
  const db = openDatabase(':memory:');
  const fetchImpl: FetchMock = vi.fn();
  const api = new ApiClient({
    getBaseUrl: () => 'https://api.test',
    tokens: noTokens,
    fetchImpl: fetchImpl,
  });
  const sync = new SyncService({
    db,
    api,
    isOnline: () => online,
    clock: () => NOW,
    random: () => 0.5,
  });
  return { db, sync, fetchImpl };
}

describe('SyncService — çekiş', () => {
  let h: Harness;

  beforeEach(() => {
    h = harness();
  });

  it('tam çekişte since parametresi GÖNDERMEZ ve önbelleği yazar', async () => {
    h.fetchImpl.mockResolvedValue(jsonResponse(pullBody([serverProduct()])));

    const result = await h.sync.runOnce({ full: true });

    expect(result.pulled).toBe(1);
    const [url] = h.fetchImpl.mock.calls[0] as [string];
    expect(url).not.toContain('since');
    expect(h.sync.status().cachedProductCount).toBe(1);
  });

  it('ikinci turda since ile delta çeker', async () => {
    h.fetchImpl.mockResolvedValue(
      jsonResponse(pullBody([serverProduct()], '2026-09-03T10:00:00.000Z')),
    );
    await h.sync.runOnce({ full: true });

    h.fetchImpl.mockClear();
    h.fetchImpl.mockResolvedValue(jsonResponse(pullBody([])));
    await h.sync.runOnce();

    const [url] = h.fetchImpl.mock.calls[0] as [string];
    expect(url).toContain('since=2026-09-03T10%3A00%3A00.000Z');
  });

  it('bozuk katalog verisini önbelleğe YAZMAZ', async () => {
    h.fetchImpl.mockResolvedValue(
      jsonResponse({
        ok: true,
        data: { serverTime: 'x', products: 'liste-değil', settings: null },
      }),
    );

    await h.sync.runOnce({ full: true });

    expect(h.sync.status().cachedProductCount).toBe(0);
    expect(h.sync.status().lastError).not.toBeNull();
  });

  it('ağ yoksa tur hiç başlamaz', async () => {
    const offline = harness(false);
    const result = await offline.sync.runOnce();
    expect(result.skipped).toBe(true);
    expect(offline.fetchImpl).not.toHaveBeenCalled();
  });
});

describe('SyncService — gönderim', () => {
  let h: Harness;

  beforeEach(() => {
    h = harness();
  });

  function stub(pushBody: unknown, pushStatus = 200): void {
    h.fetchImpl.mockImplementation((url) =>
      Promise.resolve(
        requestUrl(url).includes('/sync/sales')
          ? jsonResponse(pushBody, pushStatus)
          : jsonResponse(pullBody([])),
      ),
    );
  }

  it('kuyruktaki satışı TEK istekte gönderir ve kuyruktan düşürür', async () => {
    saveLocalSale(h.db, saleInput(), NOW, 'client-1');
    saveLocalSale(h.db, saleInput(), NOW, 'client-2');
    stub({
      ok: true,
      data: {
        results: [
          { clientSaleId: 'client-1', status: 'created', saleId: 's1', receiptNo: 'F-1' },
          { clientSaleId: 'client-2', status: 'created', saleId: 's2', receiptNo: 'F-2' },
        ],
      },
    });

    const result = await h.sync.runOnce();

    const pushCalls = h.fetchImpl.mock.calls.filter((call) =>
      requestUrl(call[0]).includes('/sync/sales'),
    );
    expect(pushCalls).toHaveLength(1);
    expect(result.pushed).toBe(2);
    expect(counts(h.db)).toEqual({ pending: 0, failed: 0 });
    expect(findLocalSale(h.db, 'client-1')?.receiptNo).toBe('F-1');
  });

  it('gönderilmiş satış ikinci turda TEKRAR GÖNDERİLMEZ', async () => {
    saveLocalSale(h.db, saleInput(), NOW, 'client-1');
    stub({
      ok: true,
      data: { results: [{ clientSaleId: 'client-1', status: 'created', saleId: 's1' }] },
    });
    await h.sync.runOnce();

    h.fetchImpl.mockClear();
    stub({ ok: true, data: { results: [] } });
    await h.sync.runOnce();

    const pushCalls = h.fetchImpl.mock.calls.filter((call) =>
      requestUrl(call[0]).includes('/sync/sales'),
    );
    expect(pushCalls).toHaveLength(0);
  });

  it('sunucu "duplicate" derse satış BAŞARILI sayılır (idempotent tekrar)', async () => {
    saveLocalSale(h.db, saleInput(), NOW, 'client-1');
    stub({
      ok: true,
      data: {
        results: [
          { clientSaleId: 'client-1', status: 'duplicate', saleId: 's1', receiptNo: 'F-9' },
        ],
      },
    });

    const result = await h.sync.runOnce();

    expect(result.pushed).toBe(1);
    expect(counts(h.db)).toEqual({ pending: 0, failed: 0 });
    expect(findLocalSale(h.db, 'client-1')?.status).toBe('SYNCED');
  });

  it('ağ koparsa satış kuyrukta KALIR ve deneme ötelenir', async () => {
    saveLocalSale(h.db, saleInput(), NOW, 'client-1');
    h.fetchImpl.mockImplementation((url) =>
      requestUrl(url).includes('/sync/sales')
        ? Promise.reject(new Error('ECONNRESET'))
        : Promise.resolve(jsonResponse(pullBody([]))),
    );

    await h.sync.runOnce();

    expect(counts(h.db)).toEqual({ pending: 1, failed: 0 });
    expect(claimDue(h.db, NOW, 10)).toHaveLength(0);
    expect(claimDue(h.db, new Date(NOW.getTime() + 6_000), 10)).toHaveLength(1);
    expect(h.sync.status().lastError).toContain('ECONNRESET');
  });

  it('yanıtta karşılığı olmayan satırı işlenmiş SAYMAZ', async () => {
    saveLocalSale(h.db, saleInput(), NOW, 'client-1');
    stub({ ok: true, data: { results: [] } });

    const result = await h.sync.runOnce();

    expect(result.pushed).toBe(0);
    expect(counts(h.db)).toEqual({ pending: 1, failed: 0 });
  });

  it('5 başarısız denemeden sonra satış kalıcı hata kuyruğuna düşer', async () => {
    saveLocalSale(h.db, saleInput(), NOW, 'client-1');
    stub({
      ok: true,
      data: {
        results: [
          {
            clientSaleId: 'client-1',
            status: 'error',
            error: { code: 'CASH_SESSION_CLOSED', message: 'Vardiya kapalı.' },
          },
        ],
      },
    });

    // Her turda bekleme süresi geçmiş sayılsın diye kendi saatiyle ileri gidiyoruz.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const future = new Date(NOW.getTime() + attempt * 3_600_000);
      const sync = new SyncService({
        db: h.db,
        api: new ApiClient({
          getBaseUrl: () => 'https://api.test',
          tokens: noTokens,
          fetchImpl: h.fetchImpl,
        }),
        isOnline: () => true,
        clock: () => future,
        random: () => 0.5,
      });
      await sync.runOnce();
    }

    expect(counts(h.db)).toEqual({ pending: 0, failed: 1 });
    expect(findLocalSale(h.db, 'client-1')?.status).toBe('FAILED');
    expect(h.sync.failedSales()).toHaveLength(1);
    expect(h.sync.failedSales()[0]?.lastError).toContain('Vardiya kapalı.');
  });

  it('elle tekrar deneme kalıcı hataları geri alır', async () => {
    saveLocalSale(h.db, saleInput(), NOW, 'client-1');
    stub({
      ok: true,
      data: {
        results: [
          { clientSaleId: 'client-1', status: 'error', error: { code: 'X', message: 'hata' } },
        ],
      },
    });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const future = new Date(NOW.getTime() + attempt * 3_600_000);
      const sync = new SyncService({
        db: h.db,
        api: new ApiClient({
          getBaseUrl: () => 'https://api.test',
          tokens: noTokens,
          fetchImpl: h.fetchImpl,
        }),
        isOnline: () => true,
        clock: () => future,
        random: () => 0.5,
      });
      await sync.runOnce();
    }
    expect(counts(h.db)).toEqual({ pending: 0, failed: 1 });

    expect(h.sync.retryFailed()).toEqual({ requeued: 1 });
    expect(counts(h.db)).toEqual({ pending: 1, failed: 0 });
    expect(findLocalSale(h.db, 'client-1')?.status).toBe('PENDING');
  });

  it('katalog çekişi patlasa BİLE kuyruk gönderilir', async () => {
    // Ödenmiş satışın sunucuya ulaşması, katalogun tazelenmesine bağlı olamaz.
    saveLocalSale(h.db, saleInput(), NOW, 'client-1');
    h.fetchImpl.mockImplementation((url) =>
      requestUrl(url).includes('/sync/sales')
        ? Promise.resolve(
            jsonResponse({
              ok: true,
              data: { results: [{ clientSaleId: 'client-1', status: 'created', saleId: 's1' }] },
            }),
          )
        : Promise.resolve(
            jsonResponse({ ok: false, error: { code: 'X', message: 'çekiş yok' } }, 500),
          ),
    );

    const result = await h.sync.runOnce({ full: true });

    expect(result.pulled).toBe(0);
    expect(result.pushed).toBe(1);
    expect(counts(h.db)).toEqual({ pending: 0, failed: 0 });
    expect(h.sync.status().lastError).toContain('Katalog çekilemedi');
    expect(h.sync.status().lastError).not.toContain('Satışlar gönderilemedi');
  });

  it('iki adım da patlarsa lastError hangisinin düştüğünü söyler', async () => {
    saveLocalSale(h.db, saleInput(), NOW, 'client-1');
    h.fetchImpl.mockRejectedValue(new Error('ECONNRESET'));

    await h.sync.runOnce({ full: true });

    expect(h.sync.status().lastError).toContain('Katalog çekilemedi');
    expect(h.sync.status().lastError).toContain('Satışlar gönderilemedi');
  });

  it('eşzamanlı iki tur çakışmaz: ikinci çağrı sürenin sonucunu bekler', async () => {
    saveLocalSale(h.db, saleInput(), NOW, 'client-1');
    // İlk tur GERÇEKTEN askıda kalsın: iki `runOnce` aynı mikrotask'ta değil,
    // araya bir olay döngüsü turu girdikten sonra çakışsın.
    let releasePush = (): void => undefined;
    const pushStarted = new Promise<void>((resolve) => {
      h.fetchImpl.mockImplementation(async (url) => {
        if (!requestUrl(url).includes('/sync/sales')) return jsonResponse(pullBody([]));
        resolve();
        await new Promise<void>((release) => {
          releasePush = release;
        });
        return jsonResponse({
          ok: true,
          data: { results: [{ clientSaleId: 'client-1', status: 'created', saleId: 's1' }] },
        });
      });
    });

    const first = h.sync.runOnce();
    await pushStarted;
    const second = h.sync.runOnce();
    releasePush();

    expect(await first).toBe(await second);
    const pushCalls = h.fetchImpl.mock.calls.filter((call) =>
      requestUrl(call[0]).includes('/sync/sales'),
    );
    expect(pushCalls).toHaveLength(1);
  });
});
