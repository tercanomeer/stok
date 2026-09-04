import { decode } from 'iconv-lite';
import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_DEVICE_CONFIG, type DeviceConfig } from './device-config';
import { DeviceError } from './device-error';
import { PrinterService } from './printer-service';
import type { Transport, TransportConfig } from './transport';
import { openDatabase, type PosDatabase } from '../db/database';
import type { ReceiptData } from '../shared/ipc-contracts';

const NOW = new Date('2026-09-04T12:00:00.000Z');

const RECEIPT: ReceiptData = {
  receiptNo: '1042',
  clientSaleId: 'client-1',
  soldAt: '2026-09-04T11:59:00.000Z',
  registerName: 'Kasa 1',
  cashierName: 'Kasiyer Ali',
  contactName: null,
  lines: [
    { name: 'Ekmek', quantity: '2', unitPrice: '10.00', lineTotal: '20.00', vatRate: 1 },
    { name: 'Çay (dökme)', quantity: '0.5', unitPrice: '120.00', lineTotal: '60.00', vatRate: 20 },
  ],
  subtotal: '69.80',
  discountTotal: '0.00',
  vatBreakdown: [
    { vatRate: 1, base: '19.80', vatAmount: '0.20' },
    { vatRate: 20, base: '50.00', vatAmount: '10.00' },
  ],
  vatTotal: '10.20',
  grandTotal: '80.00',
  payments: [{ method: 'CASH', amount: '80.00', receivedAmount: '100.00' }],
  changeDue: '20.00',
  header: 'STOKK MARKET\nBağdat Cad. No:1',
  footer: 'Teşekkür ederiz',
  currency: 'TRY',
};

/** Yazılan baytları biriktiren sahte bağlantı; gerçek port açılmaz. */
class FakeTransport implements Transport {
  written: Buffer[] = [];
  closed = 0;

  write(data: Buffer): Promise<void> {
    this.written.push(data);
    return Promise.resolve();
  }
  read(): Promise<Buffer> {
    return Promise.reject(new Error('yazıcı okuma desteklemez'));
  }
  close(): Promise<void> {
    this.closed += 1;
    return Promise.resolve();
  }
}

interface Harness {
  db: PosDatabase;
  printer: PrinterService;
  transport: FakeTransport;
  /** Bağlantı açma denemesi sayısı — her iş için bir kez açılmalı. */
  opens: () => number;
  fail: (error: Error) => void;
}

function harness(overrides: Partial<DeviceConfig['printer']> = {}): Harness {
  const db = openDatabase(':memory:');
  const transport = new FakeTransport();
  let opens = 0;
  let failure: Error | null = null;

  const config: DeviceConfig = {
    ...DEFAULT_DEVICE_CONFIG,
    printer: {
      ...DEFAULT_DEVICE_CONFIG.printer,
      transport: { kind: 'network', host: '10.0.0.5', port: 9100 },
      ...overrides,
    },
  };

  const printer = new PrinterService({
    db,
    getConfig: () => config,
    getWidthMm: () => 80,
    clock: () => NOW,
    openTransport: (_target: TransportConfig) => {
      opens += 1;
      if (failure) return Promise.reject(failure);
      return Promise.resolve(transport);
    },
  });

  return {
    db,
    printer,
    transport,
    opens: () => opens,
    fail: (error) => {
      failure = error;
    },
  };
}

/** `DLE EOT n` durum sorgusu — fiş içeriğinden ayırmak için. */
function isStatusQuery(buffer: Buffer): boolean {
  return buffer.length <= 6 && buffer[0] === 0x10 && buffer[1] === 0x04;
}

/** Yazıcıya giden FİŞ baytları (durum sorguları hariç), kod sayfası çözülerek. */
function printed(h: Harness): string {
  return decode(Buffer.concat(h.transport.written.filter((b) => !isStatusQuery(b))), 'cp857');
}

let h: Harness;

beforeEach(() => {
  h = harness();
});

describe('PrinterService — fiş basımı', () => {
  it('fişi basar ve bağlantıyı kapatır', async () => {
    const result = await h.printer.printReceipt(RECEIPT);

    expect(result).toEqual({ printed: true, queued: false, message: null });
    expect(h.opens()).toBe(1);
    expect(h.transport.closed).toBe(1);
  });

  it('fişte başlık, satırlar, KDV kırılımı ve para üstü var', async () => {
    await h.printer.printReceipt(RECEIPT);
    const text = printed(h);

    expect(text).toContain('STOKK MARKET');
    expect(text).toContain('Fis No: 1042');
    expect(text).toContain('Ekmek');
    expect(text).toContain('Çay (dökme)');
    expect(text).toContain('KDV %20');
    expect(text).toContain('TOPLAM');
    expect(text).toContain('80,00 TL');
    expect(text).toContain('Para Ustu');
    expect(text).toContain('Teşekkür ederiz');
  });

  it('Türkçe karakterler ASCII’ye düşmez', () => {
    // Fişte "Çay (dökme)" yazıyorsa kod sayfası doğru seçilmiş demektir.
    return h.printer.printReceipt(RECEIPT).then(() => {
      expect(printed(h)).toContain('dökme');
    });
  });

  it('fiş numarası yoksa bunu açıkça yazar', async () => {
    await h.printer.printReceipt({ ...RECEIPT, receiptNo: null });
    expect(printed(h)).toContain('(gonderilmedi)');
  });

  it('kopya fişin üstünde KOPYA yazar', async () => {
    await h.printer.printReceipt(RECEIPT, { copy: true });
    expect(printed(h)).toContain('KOPYA');
  });
});

describe('PrinterService — çekmece', () => {
  it('nakit satışta çekmece darbesi fişin sonuna eklenir', async () => {
    await h.printer.printReceipt(RECEIPT, { cashSale: true });

    // Tek bağlantı, tek yazım: fiş + darbe birlikte gider.
    expect(h.opens()).toBe(1);
    expect(Buffer.concat(h.transport.written).includes(Buffer.from([0x1b, 0x70, 0x00]))).toBe(true);
  });

  it('nakit olmayan satışta çekmece AÇILMAZ', async () => {
    await h.printer.printReceipt(RECEIPT, { cashSale: false });
    expect(Buffer.concat(h.transport.written).includes(Buffer.from([0x1b, 0x70, 0x00]))).toBe(
      false,
    );
  });

  it('ayar kapalıysa nakit satışta da açılmaz', async () => {
    const off = harness({ openDrawerOnCashSale: false });
    await off.printer.printReceipt(RECEIPT, { cashSale: true });
    expect(Buffer.concat(off.transport.written).includes(Buffer.from([0x1b, 0x70, 0x00]))).toBe(
      false,
    );
  });
});

describe('PrinterService — yazıcı yokken satış durmaz', () => {
  it('yazıcı tanımsızsa HATA FIRLATILMAZ ve kuyruk da BÜYÜMEZ', async () => {
    // Yazıcısı olmayan dükkânda her satış kuyruğa bir satır eklerdi; kuyruk
    // "yazıcı var ama şu an basamadı" durumu için.
    const none = harness({ transport: { kind: 'none' } });

    const result = await none.printer.printReceipt(RECEIPT);

    expect(result).toMatchObject({ printed: false, queued: false });
    expect(result.message).toContain('tanımlı değil');
    expect(none.printer.pendingCount()).toBe(0);
  });

  it('kablo çıkmışsa da kuyruğa alınır', async () => {
    h.fail(new Error('ECONNREFUSED 10.0.0.5:9100'));

    const result = await h.printer.printReceipt(RECEIPT);

    expect(result.queued).toBe(true);
    expect(result.message).toContain('ulaşılamıyor');
  });

  it('kuyruk kaydı fişin kendisini saklar — sonradan aynı tutarla basılır', async () => {
    h.fail(new Error('ECONNREFUSED'));
    await h.printer.printReceipt(RECEIPT);

    const [job] = h.printer.pending();
    expect(job).toMatchObject({
      clientSaleId: 'client-1',
      receiptNo: '1042',
      grandTotal: '80.00',
      attempts: 1,
    });
  });
});

describe('PrinterService — yeniden basım', () => {
  it('yazıcı düzelince kuyruk boşalır ve fişler KOPYA olarak çıkar', async () => {
    h.fail(new Error('ECONNREFUSED'));
    await h.printer.printReceipt(RECEIPT);
    await h.printer.printReceipt({ ...RECEIPT, clientSaleId: 'client-2', receiptNo: '1043' });
    expect(h.printer.pendingCount()).toBe(2);

    h.fail(null as unknown as Error);
    const result = await h.printer.retryPending();

    expect(result).toEqual({ printed: 2, remaining: 0 });
    expect(printed(h)).toContain('KOPYA');
  });

  it('yazıcı hâlâ kapalıysa ilk hatada DURUR — her fiş için zaman aşımı beklenmez', async () => {
    h.fail(new Error('ECONNREFUSED'));
    await h.printer.printReceipt(RECEIPT);
    await h.printer.printReceipt({ ...RECEIPT, clientSaleId: 'client-2' });
    const opensBefore = h.opens();

    const result = await h.printer.retryPending();

    expect(result).toEqual({ printed: 0, remaining: 2 });
    // Yalnız bir deneme yapıldı, iki değil.
    expect(h.opens()).toBe(opensBefore + 1);
    expect(h.printer.pending()[0]?.attempts).toBe(2);
  });

  it('kuyruk sınırsız BÜYÜMEZ — en eskiler düşer', async () => {
    // Yazıcısı günlerce bozuk kalan dükkânda kuyruk sınırsız birikirdi; her satır
    // bir fişin tamamını taşıyor.
    h.fail(new Error('ECONNREFUSED'));
    for (let index = 0; index < 205; index += 1) {
      await h.printer.printReceipt({ ...RECEIPT, clientSaleId: `client-${String(index)}` });
    }

    expect(h.printer.pendingCount()).toBe(200);
    // En YENİ fişler tutulur: kasiyerin geriye dönüp basacağı fiş onlardır.
    expect(h.printer.pending().at(-1)?.clientSaleId).toBe('client-204');
    expect(h.printer.pending()[0]?.clientSaleId).toBe('client-5');
  });

  it('bozuk kayıt bütün kuyruğu TIKAMAZ', async () => {
    // Basılamayan tek bir bozuk kayıt yüzünden arkasındaki geçerli fişler
    // süresiz beklerdi.
    h.fail(new Error('ECONNREFUSED'));
    await h.printer.printReceipt(RECEIPT);
    await h.printer.printReceipt({ ...RECEIPT, clientSaleId: 'client-2' });
    const [first] = h.printer.pending();
    // İlk kaydın fişini bozuyoruz (miktar alanı sayıya çevrilemez).
    h.db.prepare('UPDATE print_queue SET payload = ? WHERE id = ?').run('bozuk-json', first?.id);

    h.fail(null as unknown as Error);
    const result = await h.printer.retryPending();

    expect(result).toEqual({ printed: 1, remaining: 0 });
  });

  it('kuyruktaki fiş elle silinebilir', async () => {
    h.fail(new Error('ECONNREFUSED'));
    await h.printer.printReceipt(RECEIPT);
    const [job] = h.printer.pending();

    h.printer.discardPending(job?.id ?? '');
    expect(h.printer.pendingCount()).toBe(0);
  });
});

describe('PrinterService — test fişi ve sıralama', () => {
  it('test fişi Türkçe harfleri ve ayarları yazar', async () => {
    await h.printer.printTest();
    const text = printed(h);

    expect(text).toContain('STOKK TEST FISI');
    expect(text).toContain('CP857');
    expect(text).toContain('ş Ş ı İ ğ Ğ ü Ü ö Ö ç Ç');
  });

  it('test fişi yazıcı yokken HATA FIRLATIR — amaç sınamak', async () => {
    const none = harness({ transport: { kind: 'none' } });
    await expect(none.printer.printTest()).rejects.toBeInstanceOf(DeviceError);
  });

  it('eşzamanlı iki fiş SIRAYLA gider — baytlar birbirine karışmaz', async () => {
    await Promise.all([
      h.printer.printReceipt(RECEIPT),
      h.printer.printReceipt({ ...RECEIPT, clientSaleId: 'client-2' }),
    ]);

    // İki ayrı fiş, iki ayrı bağlantı; ilki bitmeden ikincisi başlamadı.
    expect(h.transport.written.filter((b) => !isStatusQuery(b))).toHaveLength(2);
    expect(h.opens()).toBe(2);
  });

  it('bir iş patlasa da sıradaki denenebilir', async () => {
    h.fail(new Error('ECONNREFUSED'));
    await h.printer.printReceipt(RECEIPT);

    h.fail(null as unknown as Error);
    const result = await h.printer.printReceipt({ ...RECEIPT, clientSaleId: 'client-2' });
    expect(result.printed).toBe(true);
  });
});

describe('PrinterService — logo', () => {
  it('logo tanımlıysa fişin başına raster olarak eklenir', async () => {
    const db = openDatabase(':memory:');
    const transport = new FakeTransport();
    const printer = new PrinterService({
      db,
      getConfig: () => ({
        ...DEFAULT_DEVICE_CONFIG,
        printer: {
          ...DEFAULT_DEVICE_CONFIG.printer,
          transport: { kind: 'network', host: '10.0.0.5', port: 9100 },
          logoPath: '/tmp/logo.png',
        },
      }),
      getWidthMm: () => 80,
      clock: () => NOW,
      loadLogo: () => ({ width: 16, height: 2, bitmap: Buffer.alloc(4, 0xff) }),
      openTransport: () => Promise.resolve(transport),
    });

    await printer.printReceipt(RECEIPT);

    expect(Buffer.concat(transport.written).includes(Buffer.from([0x1d, 0x76, 0x30]))).toBe(true);
  });

  it('logo okunamazsa fiş LOGOSUZ basılır — satış fişi kaybolmaz', async () => {
    const db = openDatabase(':memory:');
    const transport = new FakeTransport();
    const printer = new PrinterService({
      db,
      getConfig: () => ({
        ...DEFAULT_DEVICE_CONFIG,
        printer: {
          ...DEFAULT_DEVICE_CONFIG.printer,
          transport: { kind: 'network', host: '10.0.0.5', port: 9100 },
          logoPath: '/yok/logo.png',
        },
      }),
      getWidthMm: () => 80,
      clock: () => NOW,
      loadLogo: () => {
        throw new Error('dosya yok');
      },
      openTransport: () => Promise.resolve(transport),
    });

    const result = await printer.printReceipt(RECEIPT);

    expect(result.printed).toBe(true);
    expect(decode(Buffer.concat(transport.written), 'cp857')).toContain('TOPLAM');
  });
});
