import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPrismaClient } from '@stokk/db';
import { PERMISSIONS } from '@stokk/types';

import { AppModule } from '../src/app.module.js';

/**
 * Faz 12 (POS: offline depo + senkronizasyon) doğrulama maddelerinin SUNUCU tarafı:
 *
 *  1. "kuyrukta bekleyen kayıt, ağ gelince tek seferde ve TEK KOPYA olarak gidiyor"
 *     → aynı `clientSaleId` iki kez gönderilince ikinci satış AÇILMAZ.
 *  2. Kasiyer POS açılış akışını tamamlayabilir: kasa listesi + kendi kasasındaki
 *     açık vardiya sorgusu (`/cash-sessions/current`) yetkisi vardır, tüm vardiyaları
 *     listeleme yetkisi YOKTUR.
 *  3. `/sync/pull` payload'ında MALİYET alanı yok (kasa PC'si çalınırsa maliyet sızmasın).
 *  4. `since` ile delta çekiş yalnız değişeni döner.
 */
interface Envelope<T> {
  ok: boolean;
  data: T;
  error?: { code: string; message: string };
}

let app: INestApplication & NestExpressApplication;
let server: Server;
let token = '';
let unitId = '';
let registerId = '';
let sessionId = '';

let barcodeCounter = 1;
let ipCounter = 0;
const nextIp = (): string => `10.98.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;
const auth = (t = token) => ({ Authorization: `Bearer ${t}`, 'X-Forwarded-For': nextIp() });

async function createProduct(name: string, salePrice = '10.00'): Promise<string> {
  const res = await request(server)
    .post('/products')
    .set(auth())
    .send({
      name,
      unitId,
      salePrice,
      vatRate: 20,
      barcodes: [`869${String(barcodeCounter++).padStart(10, '0')}`],
    })
    .expect(201);
  const id = (res.body as Envelope<{ id: string }>).data.id;
  await request(server)
    .post('/stock/adjust')
    .set(auth())
    .send({ productId: id, newQuantity: '500', reason: 'FAZ12 başlangıç' })
    .expect(201);
  return id;
}

async function createCashierToken(): Promise<string> {
  const roles = await request(server).get('/roles').set(auth()).expect(200);
  const cashierRole = (roles.body as Envelope<{ id: string; name: string }[]>).data.find(
    (role) => role.name === 'KASIYER',
  )!;
  const email = `faz12-kasiyer-${randomUUID()}@stokk.test`;
  await request(server)
    .post('/users')
    .set(auth())
    .send({ email, password: 'KasiyerParola1', fullName: 'POS Kasiyer', roleIds: [cashierRole.id] })
    .expect(201);
  const login = await request(server)
    .post('/auth/login')
    .set('X-Forwarded-For', nextIp())
    .send({ email, password: 'KasiyerParola1' })
    .expect(200);
  return (login.body as Envelope<{ accessToken: string }>).data.accessToken;
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  app.set('trust proxy', true);
  await app.init();
  server = app.getHttpServer() as Server;

  const registered = await request(server)
    .post('/auth/register')
    .set('X-Forwarded-For', nextIp())
    .send({
      businessName: 'FAZ12 POS Market',
      fullName: 'Test Patron',
      email: `faz12-${randomUUID()}@stokk.test`,
      password: 'CokGizliParola1',
    })
    .expect(201);
  token = (registered.body as Envelope<{ accessToken: string }>).data.accessToken;

  const units = await request(server).get('/units').set(auth()).expect(200);
  unitId = (units.body as Envelope<{ id: string; abbreviation: string }[]>).data.find(
    (unit) => unit.abbreviation === 'ad',
  )!.id;

  const registers = await request(server).get('/registers').set(auth()).expect(200);
  registerId = (registers.body as Envelope<{ id: string }[]>).data[0]!.id;

  const session = await request(server)
    .post('/cash-sessions')
    .set(auth())
    .send({ registerId, openingAmount: '100.00' })
    .expect(201);
  sessionId = (session.body as Envelope<{ id: string }>).data.id;
}, 60_000);

afterAll(async () => {
  const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
  await prisma.tenant.deleteMany({ where: { name: { startsWith: 'FAZ12 ' } } });
  await prisma.$disconnect();
  await app.close();
});

describe('POS kuyruk gönderimi — tek kopya garantisi', () => {
  it('aynı clientSaleId iki kez gönderilince İKİNCİ satış açılmaz', async () => {
    const productId = await createProduct('Kuyruk Ürünü', '20.00');
    const clientSaleId = `pos-${randomUUID()}`;
    const sale = {
      clientSaleId,
      cashSessionId: sessionId,
      soldAt: new Date().toISOString(),
      lines: [{ productId, quantity: '2', unitPrice: '20.00', vatRate: 20 }],
      payments: [{ method: 'CASH', amount: '40.00' }],
    };

    const first = await request(server)
      .post('/sync/sales')
      .set(auth())
      .send({ sales: [sale] })
      .expect(201);
    const firstResults = (first.body as Envelope<{ results: { status: string; saleId: string }[] }>)
      .data.results;
    expect(firstResults[0]?.status).toBe('created');

    // Ağ koptu sanıp POS aynı kaydı tekrar gönderdi.
    const second = await request(server)
      .post('/sync/sales')
      .set(auth())
      .send({ sales: [sale] })
      .expect(201);
    const secondResults = (
      second.body as Envelope<{ results: { status: string; saleId: string }[] }>
    ).data.results;
    expect(secondResults[0]?.status).toBe('duplicate');
    expect(secondResults[0]?.saleId).toBe(firstResults[0]?.saleId);

    // Tek satış, tek stok düşüşü.
    const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
    try {
      const sales = await prisma.sale.findMany({ where: { clientSaleId }, select: { id: true } });
      expect(sales).toHaveLength(1);
      const product = await prisma.product.findUniqueOrThrow({
        where: { id: productId },
        select: { stockQuantity: true },
      });
      expect(product.stockQuantity.toString()).toBe('498');
    } finally {
      await prisma.$disconnect();
    }
  });

  it('toplu gönderimde bir kalem hata verse diğerleri yazılır', async () => {
    const productId = await createProduct('Toplu Ürün', '5.00');
    const goodId = `pos-${randomUUID()}`;
    const results = await request(server)
      .post('/sync/sales')
      .set(auth())
      .send({
        sales: [
          {
            clientSaleId: goodId,
            cashSessionId: sessionId,
            lines: [{ productId, quantity: '1', unitPrice: '5.00', vatRate: 20 }],
            payments: [{ method: 'CASH', amount: '5.00' }],
          },
          {
            clientSaleId: `pos-${randomUUID()}`,
            // Kapalı/olmayan vardiya: bu kalem reddedilmeli.
            cashSessionId: 'olmayan-vardiya',
            lines: [{ productId, quantity: '1', unitPrice: '5.00', vatRate: 20 }],
            payments: [{ method: 'CASH', amount: '5.00' }],
          },
        ],
      })
      .expect(201);

    const list = (results.body as Envelope<{ results: { clientSaleId: string; status: string }[] }>)
      .data.results;
    expect(list).toHaveLength(2);
    expect(list.find((entry) => entry.clientSaleId === goodId)?.status).toBe('created');
    expect(list.find((entry) => entry.clientSaleId !== goodId)?.status).toBe('error');
  });
});

describe('stok takibi kapalı ürün', () => {
  it('takipsiz kalem satışın TAMAMINI düşürmez', async () => {
    // `stock.applyMovement` takipsiz üründe hata verir; satış akışı bu kalemleri
    // atlamazsa hizmet kalemi içeren her satış tamamen başarısız olurdu.
    const service = await request(server)
      .post('/products')
      .set(auth())
      .send({
        name: 'Poşet (takipsiz)',
        unitId,
        salePrice: '2.00',
        vatRate: 20,
        trackStock: false,
        barcodes: [`869${String(barcodeCounter++).padStart(10, '0')}`],
      })
      .expect(201);
    const serviceId = (service.body as Envelope<{ id: string }>).data.id;
    const trackedId = await createProduct('Takipli Ürün', '10.00');

    const created = await request(server)
      .post('/sales')
      .set(auth())
      .send({
        cashSessionId: sessionId,
        lines: [
          { productId: trackedId, quantity: '1', unitPrice: '10.00', vatRate: 20 },
          { productId: serviceId, quantity: '1', unitPrice: '2.00', vatRate: 20 },
        ],
        payments: [{ method: 'CASH', amount: '12.00' }],
      })
      .expect(201);
    expect((created.body as Envelope<{ receiptNo: string }>).data.receiptNo).toBeTruthy();

    // Takipli ürünün stoğu düştü, takipsiz ürüne hareket YAZILMADI.
    const tracked = await request(server).get(`/products/${trackedId}`).set(auth()).expect(200);
    expect(Number((tracked.body as Envelope<{ stockQuantity: string }>).data.stockQuantity)).toBe(
      499,
    );
  });
});

describe('POS katalog çekişi', () => {
  it('maliyet alanı DÖNMEZ — kasa PC’sinden maliyet sızmaz', async () => {
    await createProduct('Maliyetli Ürün', '30.00');
    const pull = await request(server).get('/sync/pull').set(auth()).expect(200);
    const body = JSON.stringify(pull.body);

    // Ürün maliyeti `averageCost`, hareket maliyeti `unitCost` alanlarında tutulur.
    expect(body).not.toContain('averageCost');
    expect(body).not.toContain('unitCost');
    expect(body).not.toContain('purchasePrice');
  });

  it('ürünleri, barkodları ve POS ayarlarını döner', async () => {
    const pull = await request(server).get('/sync/pull').set(auth()).expect(200);
    const data = (
      pull.body as Envelope<{
        serverTime: string;
        products: { id: string; salePrice: string; barcodes: unknown[] }[];
        settings: { defaultVatRate: number; scaleBarcodePrefixes: string[] } | null;
      }>
    ).data;

    expect(typeof data.serverTime).toBe('string');
    expect(data.products.length).toBeGreaterThan(0);
    // Para STRING olarak iner — POS float ile hesap yapmaz.
    expect(typeof data.products[0]?.salePrice).toBe('string');
    expect(data.products[0]?.barcodes.length).toBeGreaterThan(0);
    expect(data.settings).not.toBeNull();
  });

  it('satış ekranının ihtiyaç duyduğu ayarları taşır', async () => {
    // Kasa çevrimdışıyken de indirim kapısını uygulamak ve fiş basmak zorunda;
    // bu alanlar olmadan POS eşiği bilemez ve fişin başlığı boş çıkar.
    const pull = await request(server).get('/sync/pull').set(auth()).expect(200);
    const settings = (
      pull.body as Envelope<{
        settings: {
          highDiscountThreshold: string;
          negativeStockPolicy: string;
          receiptHeader: string | null;
          receiptFooter: string | null;
        } | null;
      }>
    ).data.settings;

    expect(settings).not.toBeNull();
    expect(typeof settings?.highDiscountThreshold).toBe('string');
    expect(['ALLOW', 'WARN', 'BLOCK']).toContain(settings?.negativeStockPolicy);
    expect(settings).toHaveProperty('receiptHeader');
    expect(settings).toHaveProperty('receiptFooter');
  });

  it('since ile delta çekiş yalnız değişeni döner', async () => {
    const first = await request(server).get('/sync/pull').set(auth()).expect(200);
    const serverTime = (first.body as Envelope<{ serverTime: string }>).data.serverTime;

    // Hemen ardından hiçbir şey değişmediyse liste boş.
    const empty = await request(server)
      .get('/sync/pull')
      .query({ since: serverTime })
      .set(auth())
      .expect(200);
    expect((empty.body as Envelope<{ products: unknown[] }>).data.products).toHaveLength(0);

    // Yeni ürün eklenince yalnız o döner.
    const productId = await createProduct('Delta Ürünü', '7.50');
    const delta = await request(server)
      .get('/sync/pull')
      .query({ since: serverTime })
      .set(auth())
      .expect(200);
    const ids = (delta.body as Envelope<{ products: { id: string }[] }>).data.products.map(
      (product) => product.id,
    );
    expect(ids).toContain(productId);
  });
});

describe('POS açılış akışı — kasiyer yetkileri', () => {
  it('kasiyer kasa listesini ve kendi kasasının açık vardiyasını görebilir', async () => {
    const cashier = await createCashierToken();

    const me = await request(server).get('/auth/me').set(auth(cashier)).expect(200);
    const permissions = (me.body as Envelope<{ permissions: string[] }>).data.permissions;
    expect(permissions).toContain(PERMISSIONS.CASH_SESSION_OPEN);
    expect(permissions).not.toContain(PERMISSIONS.CASH_SESSION_VIEW_ALL);

    await request(server).get('/registers').set(auth(cashier)).expect(200);

    const current = await request(server)
      .get('/cash-sessions/current')
      .query({ registerId })
      .set(auth(cashier))
      .expect(200);
    expect((current.body as Envelope<{ id: string } | null>).data?.id).toBe(sessionId);

    // Tüm vardiyaları listeleme kasiyerin işi değil.
    await request(server).get('/cash-sessions').set(auth(cashier)).expect(403);
  });

  it('registerId olmadan sorgu reddedilir (tenant genelinde vardiya sızdırmaz)', async () => {
    const cashier = await createCashierToken();
    await request(server).get('/cash-sessions/current').set(auth(cashier)).expect(400);
  });

  it('başka tenant’ın kasası sorulursa null döner', async () => {
    const other = await request(server)
      .post('/auth/register')
      .set('X-Forwarded-For', nextIp())
      .send({
        businessName: 'FAZ12 Diğer Market',
        fullName: 'Diğer Patron',
        email: `faz12-other-${randomUUID()}@stokk.test`,
        password: 'CokGizliParola1',
      })
      .expect(201);
    const otherToken = (other.body as Envelope<{ accessToken: string }>).data.accessToken;
    const otherRegisters = await request(server)
      .get('/registers')
      .set(auth(otherToken))
      .expect(200);
    const otherRegisterId = (otherRegisters.body as Envelope<{ id: string }[]>).data[0]!.id;

    const res = await request(server)
      .get('/cash-sessions/current')
      .query({ registerId: otherRegisterId })
      .set(auth())
      .expect(200);
    expect((res.body as Envelope<unknown>).data).toBeNull();
  });

  it('açık vardiya yoksa null döner', async () => {
    const newRegister = await request(server)
      .post('/registers')
      .set(auth())
      .send({ name: `Kasa ${randomUUID().slice(0, 6)}` })
      .expect(201);
    const newRegisterId = (newRegister.body as Envelope<{ id: string }>).data.id;

    const res = await request(server)
      .get('/cash-sessions/current')
      .query({ registerId: newRegisterId })
      .set(auth())
      .expect(200);
    expect((res.body as Envelope<unknown>).data).toBeNull();
  });
});
