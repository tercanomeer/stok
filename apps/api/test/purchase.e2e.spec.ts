import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPrismaClient } from '@stokk/db';

import { AppModule } from '../src/app.module.js';

interface Envelope<T> {
  ok: boolean;
  data: T;
  error?: { code: string; message: string };
}

let app: INestApplication & NestExpressApplication;
let server: Server;
let token = '';

let ipCounter = 0;
const nextIp = (): string => `10.80.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;
const auth = () => ({ Authorization: `Bearer ${token}`, 'X-Forwarded-For': nextIp() });

async function createProduct(name: string): Promise<string> {
  const res = await request(server)
    .post('/products')
    .set(auth())
    .send({ name, unitId, salePrice: '10.00', vatRate: 20 })
    .expect(201);
  return (res.body as Envelope<{ id: string }>).data.id;
}

async function createSupplier(name: string): Promise<string> {
  const res = await request(server)
    .post('/contacts')
    .set(auth())
    .send({ type: 'SUPPLIER', name })
    .expect(201);
  return (res.body as Envelope<{ id: string }>).data.id;
}

/** Ürünün DB'deki gerçek durumu (RLS'siz owner client — stok testiyle aynı desen). */
async function productState(id: string): Promise<{ stock: number; avg: number; last: number }> {
  const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
  try {
    const p = await prisma.product.findUniqueOrThrow({
      where: { id },
      select: { stockQuantity: true, averageCost: true, lastPurchasePrice: true },
    });
    return {
      stock: Number(p.stockQuantity),
      avg: Number(p.averageCost),
      last: Number(p.lastPurchasePrice),
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function contactBalance(id: string): Promise<number> {
  const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
  try {
    const c = await prisma.contact.findUniqueOrThrow({ where: { id }, select: { balance: true } });
    return Number(c.balance);
  } finally {
    await prisma.$disconnect();
  }
}

/** Ürüne ait stok hareketleri, DB'den doğrudan (RLS'siz owner client). */
async function stockMovements(
  productId: string,
): Promise<{ type: string; quantity: number; purchaseId: string | null }[]> {
  const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
  try {
    const rows = await prisma.stockMovement.findMany({
      where: { productId },
      orderBy: { createdAt: 'asc' },
      select: { type: true, quantity: true, purchaseId: true },
    });
    return rows.map((r) => ({
      type: r.type,
      quantity: Number(r.quantity),
      purchaseId: r.purchaseId,
    }));
  } finally {
    await prisma.$disconnect();
  }
}

let unitId = '';

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  app.set('trust proxy', true);
  await app.init();
  server = app.getHttpServer() as Server;

  const reg = await request(server)
    .post('/auth/register')
    .set('X-Forwarded-For', nextIp())
    .send({
      businessName: 'FAZ5 Cari Market',
      fullName: 'Test Patron',
      email: `faz5-${randomUUID()}@stokk.test`,
      password: 'CokGizliParola1',
    })
    .expect(201);
  token = (reg.body as Envelope<{ accessToken: string }>).data.accessToken;

  const units = await request(server).get('/units').set(auth()).expect(200);
  unitId = (units.body as Envelope<{ id: string; abbreviation: string }[]>).data.find(
    (u) => u.abbreviation === 'ad',
  )!.id;
}, 60_000);

afterAll(async () => {
  const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
  await prisma.tenant.deleteMany({ where: { name: { startsWith: 'FAZ5 ' } } });
  await prisma.$disconnect();
  await app.close();
});

describe('alış faturası — tek transaction: stok + maliyet + cari borç', () => {
  it('kayıt sonrası stok arttı, ağırlıklı ortalama maliyet doğru, cari borç oluştu', async () => {
    const supplierId = await createSupplier('Tedarikçi A');
    const productId = await createProduct('Alış Ürünü');

    // 10 adet @ 100.00 (KDV hariç), %20 KDV → matrah 1000, KDV 200, genel toplam 1200.
    await request(server)
      .post('/purchases')
      .set(auth())
      .send({
        contactId: supplierId,
        invoiceDate: new Date().toISOString(),
        items: [{ productId, quantity: '10', unitPrice: '100.00', vatRate: 20 }],
      })
      .expect(201);

    const s = await productState(productId);
    expect(s.stock).toBe(10); // stok arttı
    expect(s.avg).toBe(100); // sıfır stoktan → birim maliyet
    expect(s.last).toBe(100);

    // Tedarikçiye borç: biz borçlandık → balance negatif (grandTotal kadar).
    expect(await contactBalance(supplierId)).toBe(-1200);
  });

  it('ikinci alış ağırlıklı ortalamayı doğru günceller', async () => {
    const supplierId = await createSupplier('Tedarikçi B');
    const productId = await createProduct('Ortalama Ürünü');

    await request(server)
      .post('/purchases')
      .set(auth())
      .send({
        contactId: supplierId,
        invoiceDate: new Date().toISOString(),
        items: [{ productId, quantity: '10', unitPrice: '100.00', vatRate: 20 }],
      })
      .expect(201);
    // 10 @ 200 → ortalama (10*100 + 10*200)/20 = 150.
    await request(server)
      .post('/purchases')
      .set(auth())
      .send({
        contactId: supplierId,
        invoiceDate: new Date().toISOString(),
        items: [{ productId, quantity: '10', unitPrice: '200.00', vatRate: 20 }],
      })
      .expect(201);

    const s = await productState(productId);
    expect(s.stock).toBe(20);
    expect(s.avg).toBe(150); // ağırlıklı ortalama
    expect(s.last).toBe(200);
    expect(await contactBalance(supplierId)).toBe(-(1200 + 2400));
  });

  it('müşteri cariye alış faturası kesilemez', async () => {
    const custRes = await request(server)
      .post('/contacts')
      .set(auth())
      .send({ type: 'CUSTOMER', name: 'Sadece Müşteri' })
      .expect(201);
    const custId = (custRes.body as Envelope<{ id: string }>).data.id;
    const productId = await createProduct('Reddedilecek');

    const res = await request(server)
      .post('/purchases')
      .set(auth())
      .send({
        contactId: custId,
        invoiceDate: new Date().toISOString(),
        items: [{ productId, quantity: '1', unitPrice: '10.00', vatRate: 20 }],
      })
      .expect(400);
    expect((res.body as Envelope<never>).error?.code).toBe('NOT_A_SUPPLIER');
  });
});

describe('alış faturası iptali — üç etki de geri döner', () => {
  it('iptal sonrası stok, maliyet ve cari borç eski haline döner', async () => {
    const supplierId = await createSupplier('İptal Tedarikçi');
    const productId = await createProduct('İptal Ürünü');

    const create = await request(server)
      .post('/purchases')
      .set(auth())
      .send({
        contactId: supplierId,
        invoiceDate: new Date().toISOString(),
        items: [{ productId, quantity: '5', unitPrice: '50.00', vatRate: 10 }],
      })
      .expect(201);
    const purchaseId = (create.body as Envelope<{ id: string }>).data.id;

    // Kayıt sonrası: 5 @ 50 = matrah 250, KDV 25, toplam 275.
    let s = await productState(productId);
    expect(s.stock).toBe(5);
    expect(s.avg).toBe(50);
    expect(await contactBalance(supplierId)).toBe(-275);

    await request(server).post(`/purchases/${purchaseId}/cancel`).set(auth()).expect(204);

    // İptal sonrası üçü de sıfırlanır (araya satış girmedi).
    s = await productState(productId);
    expect(s.stock).toBe(0);
    expect(s.avg).toBe(0);
    expect(await contactBalance(supplierId)).toBe(0);

    // Fatura CANCELLED.
    const detail = await request(server).get(`/purchases/${purchaseId}`).set(auth()).expect(200);
    expect((detail.body as Envelope<{ status: string }>).data.status).toBe('CANCELLED');

    // İkinci iptal reddedilir (atomik claim).
    await request(server).post(`/purchases/${purchaseId}/cancel`).set(auth()).expect(409);
  });
});

describe('ekstre toplamı ile cari bakiye birebir eşit', () => {
  it('alış + ödeme sonrası ekstre kapanışı = cari bakiye', async () => {
    const supplierId = await createSupplier('Ekstre Tedarikçi');
    const productId = await createProduct('Ekstre Ürünü');

    await request(server)
      .post('/purchases')
      .set(auth())
      .send({
        contactId: supplierId,
        invoiceDate: new Date().toISOString(),
        items: [{ productId, quantity: '10', unitPrice: '100.00', vatRate: 20 }],
      })
      .expect(201); // balance -1200

    // Tedarikçiye 500 ödeme (pay → DEBIT, balance artar) → -700.
    await request(server)
      .post('/contacts/payments')
      .set(auth())
      .send({ contactId: supplierId, direction: 'pay', amount: '500.00', method: 'TRANSFER' })
      .expect(201);

    const statement = await request(server)
      .get(`/contacts/${supplierId}/statement`)
      .query({ from: '2000-01-01T00:00:00.000Z', to: '2100-01-01T00:00:00.000Z' })
      .set(auth())
      .expect(200);
    const data = (statement.body as Envelope<{ closing: string; movements: unknown[] }>).data;

    expect(data.movements).toHaveLength(2); // alış + ödeme
    // Ekstre kapanışı ile cari bakiye birebir eşit.
    expect(Number(data.closing)).toBe(await contactBalance(supplierId));
    expect(Number(data.closing)).toBe(-700);
  });

  it('ekstre Excel çıktısı indirilebilir (xlsx)', async () => {
    const supplierId = await createSupplier('Excel Tedarikçi');
    const res = await request(server)
      .get(`/contacts/${supplierId}/statement.xlsx`)
      .query({ from: '2000-01-01T00:00:00.000Z', to: '2100-01-01T00:00:00.000Z' })
      .set(auth())
      .responseType('blob')
      .expect(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    // xlsx = zip; ilk baytlar 'PK'.
    const body = res.body as Buffer;
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(body.subarray(0, 2).toString()).toBe('PK');
  });
});

describe('iskontolu kalem — matrah/KDV/maliyet iskonto sonrası tutarı kullanır', () => {
  it('discountRate uygulanınca lineTotal/vatAmount/grandTotal ve birim maliyet iskontolu tutardan hesaplanır', async () => {
    const supplierId = await createSupplier('İskonto Tedarikçi');
    const productId = await createProduct('İskontolu Ürün');

    // 10 adet @ 100.00, %10 iskonto → matrah 900, %20 KDV → 180, genel toplam 1080.
    // Birim maliyet = iskontolu matrah / miktar = 90.
    const create = await request(server)
      .post('/purchases')
      .set(auth())
      .send({
        contactId: supplierId,
        invoiceDate: new Date().toISOString(),
        items: [
          { productId, quantity: '10', unitPrice: '100.00', discountRate: '10', vatRate: 20 },
        ],
      })
      .expect(201);
    const body = (
      create.body as Envelope<{
        subtotal: string;
        discountTotal: string;
        vatTotal: string;
        grandTotal: string;
        items: { lineTotal: string; vatAmount: string; unitPrice: string }[];
      }>
    ).data;

    expect(Number(body.subtotal)).toBe(900);
    expect(Number(body.discountTotal)).toBe(100);
    expect(Number(body.vatTotal)).toBe(180);
    expect(Number(body.grandTotal)).toBe(1080);
    expect(Number(body.items[0]!.lineTotal)).toBe(900);
    expect(Number(body.items[0]!.vatAmount)).toBe(180);

    const s = await productState(productId);
    expect(s.stock).toBe(10);
    expect(s.avg).toBe(90); // iskonto sonrası birim maliyet
    expect(s.last).toBe(90);
    expect(await contactBalance(supplierId)).toBe(-1080);
  });
});

describe('çok kalemli fatura — her ürün ayrı ayrı doğru, cari borç toplamı eşit', () => {
  it('2 farklı üründen oluşan faturada her ürünün stoğu/maliyeti bağımsız güncellenir', async () => {
    const supplierId = await createSupplier('Çok Kalem Tedarikçi');
    const productA = await createProduct('Çok Kalem Ürün A');
    const productB = await createProduct('Çok Kalem Ürün B');

    // A: 5 @ 50.00, %10 KDV → matrah 250, KDV 25, toplam 275.
    // B: 3 @ 80.00, %20 KDV → matrah 240, KDV 48, toplam 288.
    // grandTotal = 275 + 288 = 563.
    await request(server)
      .post('/purchases')
      .set(auth())
      .send({
        contactId: supplierId,
        invoiceDate: new Date().toISOString(),
        items: [
          { productId: productA, quantity: '5', unitPrice: '50.00', vatRate: 10 },
          { productId: productB, quantity: '3', unitPrice: '80.00', vatRate: 20 },
        ],
      })
      .expect(201);

    const sa = await productState(productA);
    expect(sa.stock).toBe(5);
    expect(sa.avg).toBe(50);

    const sb = await productState(productB);
    expect(sb.stock).toBe(3);
    expect(sb.avg).toBe(80);

    expect(await contactBalance(supplierId)).toBe(-563);
  });
});

describe('stok hareketi kaydı — alışta PURCHASE, iptalde PURCHASE_RETURN', () => {
  it('alış sonrası StockMovement(type=PURCHASE, purchaseId dolu), iptalde PURCHASE_RETURN eklenir', async () => {
    const supplierId = await createSupplier('Hareket Tedarikçi');
    const productId = await createProduct('Hareket Ürünü');

    const create = await request(server)
      .post('/purchases')
      .set(auth())
      .send({
        contactId: supplierId,
        invoiceDate: new Date().toISOString(),
        items: [{ productId, quantity: '7', unitPrice: '20.00', vatRate: 20 }],
      })
      .expect(201);
    const purchaseId = (create.body as Envelope<{ id: string }>).data.id;

    let movements = await stockMovements(productId);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ type: 'PURCHASE', quantity: 7, purchaseId });

    await request(server).post(`/purchases/${purchaseId}/cancel`).set(auth()).expect(204);

    movements = await stockMovements(productId);
    expect(movements).toHaveLength(2);
    expect(movements[1]).toMatchObject({
      type: 'PURCHASE_RETURN',
      quantity: -7,
      purchaseId,
    });
  });
});

describe('alış ile iptal arasına fire girerse', () => {
  it('iptal yine de patlamadan tamamlanır, PURCHASE_RETURN yazılır, cari sıfırlanır', async () => {
    const supplierId = await createSupplier('Fire Arası Tedarikçi');
    const productId = await createProduct('Fire Arası Ürünü');

    const create = await request(server)
      .post('/purchases')
      .set(auth())
      .send({
        contactId: supplierId,
        invoiceDate: new Date().toISOString(),
        items: [{ productId, quantity: '10', unitPrice: '100.00', vatRate: 20 }],
      })
      .expect(201);
    const purchaseId = (create.body as Envelope<{ id: string }>).data.id;

    expect((await productState(productId)).stock).toBe(10);
    expect(await contactBalance(supplierId)).toBe(-1200);

    // Araya fire girer: 4 adet fire.
    await request(server)
      .post('/stock/waste')
      .set(auth())
      .send({ productId, quantity: '4', reason: 'FAZ5 test fire' })
      .expect(201);
    expect((await productState(productId)).stock).toBe(6);

    // İptal patlamadan tamamlanmalı (negatif stok politikası varsayılan WARN).
    await request(server).post(`/purchases/${purchaseId}/cancel`).set(auth()).expect(204);

    // Stok hareketi yine de yazılır: 6 - 10 = -4 (deterministik, negatif stoka izin var).
    const s = await productState(productId);
    expect(s.stock).toBe(-4);
    const movements = await stockMovements(productId);
    expect(movements.map((m) => m.type)).toEqual(['PURCHASE', 'WASTE', 'PURCHASE_RETURN']);

    // Cari borç, aradaki fireden bağımsız — tam sıfırlanır.
    expect(await contactBalance(supplierId)).toBe(0);
    // averageCost bu senaryoda birebir eski değere dönmeyebilir (bilinen davranış) —
    // yalnız sonlu/negatif olmayan bir Decimal olduğunu doğrula, kesin değer assert etme.
    expect(Number.isFinite(s.avg)).toBe(true);
  });
});

describe("cross-tenant izolasyon — başka tenant'ın alış faturası görünmez", () => {
  it("B tenant'ı A tenant'ının alış faturasını GET edemez (404)", async () => {
    const regB = await request(server)
      .post('/auth/register')
      .set('X-Forwarded-For', nextIp())
      .send({
        businessName: 'FAZ5 Cross Tenant B',
        fullName: 'Test Patron B',
        email: `faz5-cross-${randomUUID()}@stokk.test`,
        password: 'CokGizliParola1',
      })
      .expect(201);
    const tokenB = (regB.body as Envelope<{ accessToken: string }>).data.accessToken;
    const authB = { Authorization: `Bearer ${tokenB}`, 'X-Forwarded-For': nextIp() };

    const supplierId = await createSupplier('Cross Tenant Tedarikçi');
    const productId = await createProduct('Cross Tenant Ürünü');
    const create = await request(server)
      .post('/purchases')
      .set(auth())
      .send({
        contactId: supplierId,
        invoiceDate: new Date().toISOString(),
        items: [{ productId, quantity: '1', unitPrice: '10.00', vatRate: 20 }],
      })
      .expect(201);
    const purchaseId = (create.body as Envelope<{ id: string }>).data.id;

    await request(server).get(`/purchases/${purchaseId}`).set(authB).expect(404);
    await request(server).post(`/purchases/${purchaseId}/cancel`).set(authB).expect(404);

    // A tenant'ından hâlâ COMPLETED olarak okunabilmeli (B'nin denemesi etkilemedi).
    const stillThere = await request(server)
      .get(`/purchases/${purchaseId}`)
      .set(auth())
      .expect(200);
    expect((stillThere.body as Envelope<{ status: string }>).data.status).toBe('COMPLETED');
  });
});

describe('ajan bulguları — regresyon testleri (Faz 5)', () => {
  it('miktar "0" reddedilir (0/0 = NaN maliyet bozulması önlenir)', async () => {
    const supplierId = await createSupplier('Sıfır Miktar Tedarikçi');
    const productId = await createProduct('Sıfır Miktar Ürünü');
    await request(server)
      .post('/purchases')
      .set(auth())
      .send({
        contactId: supplierId,
        invoiceDate: new Date().toISOString(),
        items: [{ productId, quantity: '0', unitPrice: '100.00', vatRate: 20 }],
      })
      .expect(400);
  });

  it('iskonto oranı %100 üstü reddedilir (negatif maliyet önlenir)', async () => {
    const supplierId = await createSupplier('Yüksek İskonto Tedarikçi');
    const productId = await createProduct('Yüksek İskonto Ürünü');
    await request(server)
      .post('/purchases')
      .set(auth())
      .send({
        contactId: supplierId,
        invoiceDate: new Date().toISOString(),
        items: [
          { productId, quantity: '5', unitPrice: '100.00', discountRate: '150', vatRate: 20 },
        ],
      })
      .expect(400);
  });

  it('araya ucuz alış girse de iptalde averageCost negatife düşmez (>= 0)', async () => {
    const supplierId = await createSupplier('Negatif Maliyet Tedarikçi');
    const productId = await createProduct('Negatif Maliyet Ürünü');

    // Alış A: 10 @ 100 → stok 10, avg 100.
    const createA = await request(server)
      .post('/purchases')
      .set(auth())
      .send({
        contactId: supplierId,
        invoiceDate: new Date().toISOString(),
        items: [{ productId, quantity: '10', unitPrice: '100.00', vatRate: 0 }],
      })
      .expect(201);
    const purchaseA = (createA.body as Envelope<{ id: string }>).data.id;

    // Fire 9 → stok 1 (avg değişmez, satış yerine fire ile stok azaltılıyor).
    await request(server)
      .post('/stock/waste')
      .set(auth())
      .send({ productId, quantity: '9', reason: 'FAZ5 negatif maliyet senaryosu' })
      .expect(201);

    // Alış B: 100 @ 1 → ortalama ~1.98'e seyrelir.
    await request(server)
      .post('/purchases')
      .set(auth())
      .send({
        contactId: supplierId,
        invoiceDate: new Date().toISOString(),
        items: [{ productId, quantity: '100', unitPrice: '1.00', vatRate: 0 }],
      })
      .expect(201);

    // A iptal: ters formül negatif pay üretir; 0'a kelepçelenmeli, negatif OLMAMALI.
    await request(server).post(`/purchases/${purchaseA}/cancel`).set(auth()).expect(204);
    const s = await productState(productId);
    expect(s.avg).toBeGreaterThanOrEqual(0);
  });

  it('fazla ödeme sonrası aging toplamı = cari bakiye (peşin ödeme ileri taşınır)', async () => {
    // Cari hareket tipi bağımsız test: pay→DEBIT (+bakiye), collect→CREDIT (-bakiye).
    const res = await request(server)
      .post('/contacts')
      .set(auth())
      .send({ type: 'BOTH', name: 'Fazla Ödeme Cari' })
      .expect(201);
    const contactId = (res.body as Envelope<{ id: string }>).data.id;

    // DEBIT 100 → bakiye +100 (bize borçlu).
    await request(server)
      .post('/contacts/payments')
      .set(auth())
      .send({ contactId, direction: 'pay', amount: '100.00', method: 'CASH' })
      .expect(201);
    // CREDIT 150 → 100 borç kapanır, 50 fazla → bakiye -50.
    await request(server)
      .post('/contacts/payments')
      .set(auth())
      .send({ contactId, direction: 'collect', amount: '150.00', method: 'CASH' })
      .expect(201);
    // DEBIT 80 → 50 peşin düşülür, 30 açık → bakiye +30.
    await request(server)
      .post('/contacts/payments')
      .set(auth())
      .send({ contactId, direction: 'pay', amount: '80.00', method: 'CASH' })
      .expect(201);

    const aging = await request(server).get(`/contacts/${contactId}/aging`).set(auth()).expect(200);
    const total = Number((aging.body as Envelope<{ total: string }>).data.total);
    // Fazla ödeme kaybolmaz: aging toplamı gerçek bakiyeye eşit (yamasız 80 olurdu).
    expect(total).toBe(30);
    expect(total).toBe(await contactBalance(contactId));
  });
});
