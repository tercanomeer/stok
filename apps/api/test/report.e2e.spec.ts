import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { performance } from 'node:perf_hooks';

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

const SEED_COUNT = 100_000;
const RANGE_FROM = '2000-01-01T00:00:00.000Z';
const RANGE_TO = '2100-01-01T00:00:00.000Z';

let app: INestApplication & NestExpressApplication;
let server: Server;
let token = '';
let tenantId = '';
let unitId = '';

let ipCounter = 0;
const nextIp = (): string => `10.100.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;
const auth = (t = token) => ({ Authorization: `Bearer ${t}`, 'X-Forwarded-For': nextIp() });

async function cashierToken(): Promise<string> {
  const roles = await request(server).get('/roles').set(auth()).expect(200);
  const kasiyer = (roles.body as Envelope<{ id: string; name: string }[]>).data.find(
    (r) => r.name === 'KASIYER',
  )!;
  const email = `faz7-kasiyer-${randomUUID()}@stokk.test`;
  await request(server)
    .post('/users')
    .set(auth())
    .send({ email, password: 'KasiyerParola1', fullName: 'Kasiyer', roleIds: [kasiyer.id] })
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

  const reg = await request(server)
    .post('/auth/register')
    .set('X-Forwarded-For', nextIp())
    .send({
      businessName: 'FAZ7 Rapor Market',
      fullName: 'Test Patron',
      email: `faz7-${randomUUID()}@stokk.test`,
      password: 'CokGizliParola1',
    })
    .expect(201);
  const data = (reg.body as Envelope<{ accessToken: string; user: { tenantId: string } }>).data;
  token = data.accessToken;
  tenantId = data.user.tenantId;

  const units = await request(server).get('/units').set(auth()).expect(200);
  unitId = (units.body as Envelope<{ id: string; abbreviation: string }[]>).data.find(
    (u) => u.abbreviation === 'ad',
  )!.id;

  const registers = await request(server).get('/registers').set(auth()).expect(200);
  const registerId = (registers.body as Envelope<{ id: string }[]>).data[0]!.id;
  const session = await request(server)
    .post('/cash-sessions')
    .set(auth())
    .send({ registerId, openingAmount: '0.00' })
    .expect(201);
  const sessionId = (session.body as Envelope<{ id: string }>).data.id;

  const product = await request(server)
    .post('/products')
    .set(auth())
    .send({ name: 'Seed Ürün', unitId, salePrice: '12.00', vatRate: 20 })
    .expect(201);
  const productId = (product.body as Envelope<{ id: string }>).data.id;

  const usersRes = await request(server).get('/users').set(auth()).expect(200);
  const userId = (usersRes.body as Envelope<{ id: string }[]>).data[0]!.id;

  // 100k satış + kalem + ödeme — ham SQL ile hızlı seed (owner client, RLS bypass).
  const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
  try {
    await prisma.$executeRawUnsafe(`
      INSERT INTO sales (id,"tenantId","cashSessionId","registerId","userId","receiptNo",status,
        subtotal,"discountTotal","vatTotal","grandTotal","vatBreakdown","soldAt","createdAt","updatedAt")
      SELECT 'seed-'||g, '${tenantId}', '${sessionId}', '${registerId}', '${userId}', 'RSEED'||g, 'COMPLETED',
        10.00, 0, 2.00, 12.00, '[]'::jsonb,
        now() - ((g % 60)||' days')::interval - ((g % 24)||' hours')::interval, now(), now()
      FROM generate_series(1, ${SEED_COUNT}) g`);
    await prisma.$executeRawUnsafe(`
      INSERT INTO sale_items (id,"tenantId","saleId","productId","productName",quantity,"unitPrice",
        "discountRate","vatRate","netAmount","vatAmount","lineTotal","unitCost","createdAt")
      SELECT 'si-'||g, '${tenantId}', 'seed-'||g, '${productId}', 'Seed Ürün', 1, 12.00, 0, 20,
        10.00, 2.00, 12.00, 6.0000, now()
      FROM generate_series(1, ${SEED_COUNT}) g`);
    await prisma.$executeRawUnsafe(`
      INSERT INTO sale_payments (id,"tenantId","saleId",method,amount,"createdAt")
      SELECT 'sp-'||g, '${tenantId}', 'seed-'||g,
        (ARRAY['CASH','CARD'])[1+(g%2)]::"PaymentMethod", 12.00, now()
      FROM generate_series(1, ${SEED_COUNT}) g`);
    await prisma.$executeRawUnsafe(`ANALYZE sales; ANALYZE sale_items; ANALYZE sale_payments`);
  } finally {
    await prisma.$disconnect();
  }
}, 180_000);

afterAll(async () => {
  const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
  // Seed satırlarını toplu sil (ORM cascade 300k satırda çok yavaş); sonra tenant'ı kaldır.
  await prisma.$executeRawUnsafe(`DELETE FROM sale_payments WHERE id LIKE 'sp-%'`);
  await prisma.$executeRawUnsafe(`DELETE FROM sale_items WHERE id LIKE 'si-%'`);
  await prisma.$executeRawUnsafe(`DELETE FROM sales WHERE id LIKE 'seed-%'`);
  await prisma.tenant.deleteMany({ where: { name: { startsWith: 'FAZ7 ' } } });
  await prisma.$disconnect();
  await app.close();
}, 180_000);

async function timed(path: string, query: Record<string, string>): Promise<number> {
  const t0 = performance.now();
  await request(server).get(path).query(query).set(auth()).expect(200);
  return performance.now() - t0;
}

describe('raporlar — 100k satış seed ile performans', () => {
  const range = { from: RANGE_FROM, to: RANGE_TO };

  it('her rapor makul sürede döner (hedef < 1 s)', async () => {
    const budget = 2000; // CI güvenliği; hedef 1000ms, gerçek süre loglanır.
    const cases: [string, Record<string, string>][] = [
      ['/reports/dashboard', range],
      ['/reports/sales', { ...range, granularity: 'day' }],
      ['/reports/profit', { ...range, granularity: 'day' }],
      ['/reports/top-products', { ...range, limit: '10' }],
      ['/reports/cashier-performance', range],
      ['/reports/hourly-density', range],
      ['/reports/stock-value', {}],
      ['/reports/contact-aging', {}],
      ['/reports/payment-distribution', range],
      ['/reports/daily-shift', { date: new Date().toISOString().slice(0, 10) }],
    ];
    for (const [path, query] of cases) {
      const ms = await timed(path, query);

      console.warn(`${path} → ${ms.toFixed(0)}ms`);
      expect(ms).toBeLessThan(budget);
    }
  }, 60_000);

  it('satış raporu zaman serisi ve toplamlar tutarlı', async () => {
    const res = await request(server)
      .get('/reports/sales')
      .query({ from: RANGE_FROM, to: RANGE_TO, granularity: 'month' })
      .set(auth())
      .expect(200);
    const data = (res.body as Envelope<{ series: { total: string; count: number }[] }>).data;
    const totalCount = data.series.reduce((a, s) => a + s.count, 0);
    expect(totalCount).toBe(SEED_COUNT);
  });
});

describe('yetki filtresi — maliyet/kâr yalnız yetkili rolde', () => {
  it('kasiyer token ile kâr raporu → 403', async () => {
    const cashier = await cashierToken();
    await request(server)
      .get('/reports/profit')
      .query({ from: RANGE_FROM, to: RANGE_TO })
      .set(auth(cashier))
      .expect(403);
  });

  it('kasiyer token ile stok değeri (maliyet) → 403', async () => {
    const cashier = await cashierToken();
    await request(server).get('/reports/stock-value').set(auth(cashier)).expect(403);
  });
});

describe('export job — Excel dosyası üretir', () => {
  it('sales raporu XLSX export job’ı tamamlanır ve dosya URL’i döner', async () => {
    const enqueue = await request(server)
      .post('/exports')
      .set(auth())
      .send({
        report: 'sales',
        format: 'XLSX',
        from: RANGE_FROM,
        to: RANGE_TO,
        granularity: 'month',
      })
      .expect(201);
    const jobId = (enqueue.body as Envelope<{ jobId: string }>).data.jobId;

    // İş aynı süreçte işlenir; kısa poll.
    let status = 'PENDING';
    let fileUrl: string | null = null;
    for (let i = 0; i < 40 && status !== 'COMPLETED' && status !== 'FAILED'; i++) {
      await new Promise((r) => setTimeout(r, 250));
      const res = await request(server).get(`/exports/${jobId}`).set(auth()).expect(200);
      const data = (res.body as Envelope<{ status: string; fileUrl: string | null }>).data;
      status = data.status;
      fileUrl = data.fileUrl;
    }
    expect(status).toBe('COMPLETED');
    expect(fileUrl).toBeTruthy();
    expect(fileUrl).toContain('exports/');
  }, 30_000);
});

describe('mock e-fatura akışı — DRAFT → SENT → ACCEPTED, PDF', () => {
  it('satıştan e-belge oluşturulur, gönderilir, kabul edilir ve PDF döner', async () => {
    // Gerçek bir satış (seed değil — FK ve tutarlar için). Yeni kasa: beforeAll'ın açık
    // vardiyasıyla çakışma olmasın.
    const register = await request(server)
      .post('/registers')
      .set(auth())
      .send({ name: `Kasa EF ${randomUUID().slice(0, 8)}` })
      .expect(201);
    const registerId = (register.body as Envelope<{ id: string }>).data.id;
    const openSession = await request(server)
      .post('/cash-sessions')
      .set(auth())
      .send({ registerId, openingAmount: '0.00' })
      .expect(201);
    const sessionId = (openSession.body as Envelope<{ id: string }>).data.id;
    const product = await request(server)
      .post('/products')
      .set(auth())
      .send({ name: 'E-Fatura Ürünü', unitId, salePrice: '100.00', vatRate: 20 })
      .expect(201);
    const productId = (product.body as Envelope<{ id: string }>).data.id;
    await request(server)
      .post('/stock/adjust')
      .set(auth())
      .send({ productId, newQuantity: '10', reason: 'seed' })
      .expect(201);
    const sale = await request(server)
      .post('/sales')
      .set(auth())
      .send({
        cashSessionId: sessionId,
        lines: [{ productId, quantity: '1', unitPrice: '100.00', vatRate: 20 }],
        payments: [{ method: 'CASH', amount: '100.00' }],
      })
      .expect(201);
    const saleId = (sale.body as Envelope<{ id: string }>).data.id;

    const draft = await request(server)
      .post(`/e-invoices/from-sale/${saleId}`)
      .set(auth())
      .expect(201);
    const draftData = (draft.body as Envelope<{ id: string; status: string }>).data;
    expect(draftData.status).toBe('DRAFT');
    const einvoiceId = draftData.id;

    const sent = await request(server)
      .post(`/e-invoices/${einvoiceId}/send`)
      .set(auth())
      .expect(201);
    const sentData = (sent.body as Envelope<{ status: string; externalId: string }>).data;
    expect(sentData.status).toBe('SENT');
    expect(sentData.externalId).toBeTruthy();

    const accepted = await request(server)
      .post(`/e-invoices/${einvoiceId}/refresh`)
      .set(auth())
      .expect(201);
    expect((accepted.body as Envelope<{ status: string }>).data.status).toBe('ACCEPTED');

    const pdf = await request(server)
      .get(`/e-invoices/${einvoiceId}/pdf`)
      .set(auth())
      .responseType('blob')
      .expect(200);
    expect(pdf.headers['content-type']).toContain('pdf');
    const body = pdf.body as Buffer;
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(body.subarray(0, 4).toString()).toBe('%PDF');
  }, 30_000);
});
