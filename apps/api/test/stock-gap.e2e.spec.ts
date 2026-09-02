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

/**
 * Faz 4 doğrulama denetiminde tespit edilen boşlukları kapatan ek e2e testleri.
 * `stock.e2e.spec.ts` ile aynı desen: gerçek Postgres/Redis, X-Forwarded-For ile
 * IP izolasyonu, "FAZ4-GAP " ön ekli tenant adı + afterAll temizliği.
 */
interface Envelope<T> {
  ok: boolean;
  data: T;
  error?: { code: string; message: string };
}

interface AuthPayload {
  accessToken: string;
  user: { id: string; tenantId: string };
}

let app: INestApplication & NestExpressApplication;
let server: Server;

let ipCounter = 0;
const nextIp = (): string => `10.71.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

const authHeader = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'X-Forwarded-For': nextIp(),
});

async function registerTenant(businessName: string): Promise<AuthPayload> {
  const res = await request(server)
    .post('/auth/register')
    .set('X-Forwarded-For', nextIp())
    .send({
      businessName,
      fullName: 'Test Patron',
      email: `faz4-gap-${randomUUID()}@stokk.test`,
      password: 'CokGizliParola1',
    })
    .expect(201);
  return (res.body as Envelope<AuthPayload>).data;
}

async function getUnitId(auth: ReturnType<typeof authHeader>): Promise<string> {
  const units = await request(server).get('/units').set(auth).expect(200);
  return (units.body as Envelope<{ id: string; abbreviation: string }[]>).data.find(
    (u) => u.abbreviation === 'ad',
  )!.id;
}

async function createProduct(
  auth: ReturnType<typeof authHeader>,
  unitId: string,
  name: string,
  criticalLevel = '0',
): Promise<string> {
  const res = await request(server)
    .post('/products')
    .set(auth)
    .send({ name, unitId, salePrice: '10.00', vatRate: 20, criticalLevel })
    .expect(201);
  return (res.body as Envelope<{ id: string }>).data.id;
}

async function stockOf(auth: ReturnType<typeof authHeader>, productId: string): Promise<string> {
  const res = await request(server).get(`/products/${productId}`).set(auth).expect(200);
  return String((res.body as Envelope<{ stockQuantity: string }>).data.stockQuantity);
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  app.set('trust proxy', true);
  await app.init();
  server = app.getHttpServer() as Server;
}, 60_000);

afterAll(async () => {
  const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
  await prisma.tenant.deleteMany({ where: { name: { startsWith: 'FAZ4-GAP ' } } });
  await prisma.$disconnect();
  await app.close();
});

describe('karışık hareket tipleri eşzamanlılığı', () => {
  it('fire ve manuel düzeltme aynı ürüne paralel: ledger tutarlı, kayıp güncelleme yok', async () => {
    const tenant = await registerTenant('FAZ4-GAP Karışık');
    const auth = authHeader(tenant.accessToken);
    const unitId = await getUnitId(auth);
    const productId = await createProduct(auth, unitId, 'Karışık Ürün');

    await request(server)
      .post('/stock/adjust')
      .set(auth)
      .send({ productId, newQuantity: '200', reason: 'başlangıç' })
      .expect(201);

    // 15 eşzamanlı fire (-1) ve 15 eşzamanlı manuel düzeltme (farklı hedeflere).
    // Manuel düzeltme mutlak hedefe kilitlenmiş satırın anlık değerine göre delta
    // üretir; bu yüzden nihai değeri önceden tahmin etmiyoruz — invaryant, ledger'ın
    // iç tutarlılığı ve kayıp güncelleme (lost update) olmamasıdır.
    const wasteCalls = Array.from({ length: 15 }, () =>
      request(server)
        .post('/stock/waste')
        .set(auth)
        .send({ productId, quantity: '1', reason: 'paralel fire' }),
    );
    const adjustCalls = Array.from({ length: 15 }, (_, i) =>
      request(server)
        .post('/stock/adjust')
        .set(auth)
        .send({ productId, newQuantity: String(150 + i), reason: 'paralel düzeltme' }),
    );
    const results = await Promise.allSettled([...wasteCalls, ...adjustCalls]);
    const ok = results.filter((r) => r.status === 'fulfilled' && r.value.status === 201);
    // Patolojik tek-satır kontenşında pool/timeout bazı istekleri düşürebilir; ASIL
    // doğrulanan invaryant aşağıdaki zincir tutarlılığı (lost update yok), sayı değil.
    expect(ok.length).toBeGreaterThanOrEqual(1);

    const finalStock = Number(await stockOf(auth, productId));

    const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
    try {
      const movements = await prisma.stockMovement.findMany({
        where: { productId },
        select: { quantity: true, balanceAfter: true, type: true, createdAt: true },
        orderBy: [{ createdAt: 'asc' }],
      });
      // Başlangıç dahil hareket sayısı = 1 (adjust başlangıç) + başarılı paralel çağrılar.
      expect(movements.length).toBe(1 + ok.length);
      expect(movements.some((m) => m.type === 'WASTE')).toBe(true);
      expect(movements.some((m) => m.type === 'MANUAL_ADJUSTMENT')).toBe(true);

      // `adjust` mutlak hedefe kilitlendiği için balanceAfter değerleri arasında
      // rastlantısal eşitlik olabilir (iki farklı yoldan aynı bakiyeye ulaşmak) —
      // bu yüzden benzersizlik yerine ZİNCİR tutarlılığı denetlenir: kayıp güncelleme
      // (lost update) olsaydı bir hareketin balanceAfter'ı bir öncekinin balanceAfter'ı
      // + kendi quantity'sine eşit OLMAZDI (araya kaçan başka bir tx'in etkisi kaybolurdu).
      let running = 0;
      for (const m of movements) {
        running += Number(m.quantity);
        expect(Number(m.balanceAfter)).toBe(running);
      }

      // Denormalize alan, ledger'daki son balanceAfter ile birebir eşit olmalı.
      expect(running).toBe(finalStock);
    } finally {
      await prisma.$disconnect();
    }
  }, 60_000);
});

describe('sayım — üst üste okutma ve durum makinesi', () => {
  it('aynı ürün üst üste okutulunca countedQuantity birikir', async () => {
    const tenant = await registerTenant('FAZ4-GAP Üst Üste');
    const auth = authHeader(tenant.accessToken);
    const unitId = await getUnitId(auth);
    const productId = await createProduct(auth, unitId, 'Üst Üste Ürün');
    await request(server)
      .post('/stock/adjust')
      .set(auth)
      .send({ productId, newQuantity: '50', reason: 'giriş' })
      .expect(201);

    const start = await request(server).post('/stock/counts').set(auth).send({}).expect(201);
    const countId = (start.body as Envelope<{ id: string }>).data.id;

    await request(server)
      .post(`/stock/counts/${countId}/items`)
      .set(auth)
      .send({ product: productId, quantity: '5' })
      .expect(201);
    await request(server)
      .post(`/stock/counts/${countId}/items`)
      .set(auth)
      .send({ product: productId, quantity: '3' })
      .expect(201);
    const third = await request(server)
      .post(`/stock/counts/${countId}/items`)
      .set(auth)
      .send({ product: productId, quantity: '2' })
      .expect(201);
    expect(Number((third.body as Envelope<{ countedQuantity: string }>).data.countedQuantity)).toBe(
      10,
    ); // 5 + 3 + 2 birikmiş olmalı

    const detail = await request(server).get(`/stock/counts/${countId}`).set(auth).expect(200);
    const item = (
      detail.body as Envelope<{ items: { productId: string; countedQuantity: string }[] }>
    ).data.items.find((i) => i.productId === productId);
    expect(Number(item?.countedQuantity)).toBe(10);

    // Tamamla: sistem 50, sayılan 10 → tek COUNT_ADJUSTMENT ile -40.
    const complete = await request(server)
      .post(`/stock/counts/${countId}/complete`)
      .set(auth)
      .expect(201);
    expect((complete.body as Envelope<{ adjustments: number }>).data.adjustments).toBe(1);
    expect(Number(await stockOf(auth, productId))).toBe(10);
  });

  it('tamamlanmış sayıma kalem eklenemez ve tekrar tamamlanamaz (400/409)', async () => {
    const tenant = await registerTenant('FAZ4-GAP Durum');
    const auth = authHeader(tenant.accessToken);
    const unitId = await getUnitId(auth);
    const productId = await createProduct(auth, unitId, 'Durum Ürünü');
    await request(server)
      .post('/stock/adjust')
      .set(auth)
      .send({ productId, newQuantity: '5', reason: 'giriş' })
      .expect(201);

    const start = await request(server).post('/stock/counts').set(auth).send({}).expect(201);
    const countId = (start.body as Envelope<{ id: string }>).data.id;
    await request(server).post(`/stock/counts/${countId}/complete`).set(auth).expect(201);

    // Tamamlanmış sayıma kalem eklenemez.
    const addAfter = await request(server)
      .post(`/stock/counts/${countId}/items`)
      .set(auth)
      .send({ product: productId, quantity: '1' })
      .expect(400);
    expect((addAfter.body as Envelope<never>).error?.code).toBe('COUNT_NOT_IN_PROGRESS');

    // Tekrar tamamlanamaz.
    const completeAgain = await request(server)
      .post(`/stock/counts/${countId}/complete`)
      .set(auth)
      .expect(409);
    expect((completeAgain.body as Envelope<never>).error?.code).toBe('CONFLICT');

    // İptal de edilemez (zaten tamamlanmış).
    await request(server).post(`/stock/counts/${countId}/cancel`).set(auth).expect(409);
  });

  it('iptal edilmiş sayıma kalem eklenemez ve tamamlanamaz (400/409)', async () => {
    const tenant = await registerTenant('FAZ4-GAP İptal Durum');
    const auth = authHeader(tenant.accessToken);
    const unitId = await getUnitId(auth);
    const productId = await createProduct(auth, unitId, 'İptal Durum Ürünü');
    await request(server)
      .post('/stock/adjust')
      .set(auth)
      .send({ productId, newQuantity: '5', reason: 'giriş' })
      .expect(201);

    const start = await request(server).post('/stock/counts').set(auth).send({}).expect(201);
    const countId = (start.body as Envelope<{ id: string }>).data.id;
    await request(server).post(`/stock/counts/${countId}/cancel`).set(auth).expect(204);

    const addAfter = await request(server)
      .post(`/stock/counts/${countId}/items`)
      .set(auth)
      .send({ product: productId, quantity: '1' })
      .expect(400);
    expect((addAfter.body as Envelope<never>).error?.code).toBe('COUNT_NOT_IN_PROGRESS');

    const completeAfter = await request(server)
      .post(`/stock/counts/${countId}/complete`)
      .set(auth)
      .expect(409);
    expect((completeAfter.body as Envelope<never>).error?.code).toBe('CONFLICT');
  });

  it('fark sıfırsa (sayılan = sistem) hareket üretilmez, stok değişmez', async () => {
    const tenant = await registerTenant('FAZ4-GAP Sıfır Fark');
    const auth = authHeader(tenant.accessToken);
    const unitId = await getUnitId(auth);
    const productId = await createProduct(auth, unitId, 'Sıfır Fark Ürünü');
    await request(server)
      .post('/stock/adjust')
      .set(auth)
      .send({ productId, newQuantity: '40', reason: 'giriş' })
      .expect(201);

    const start = await request(server).post('/stock/counts').set(auth).send({}).expect(201);
    const countId = (start.body as Envelope<{ id: string }>).data.id;
    await request(server)
      .post(`/stock/counts/${countId}/items`)
      .set(auth)
      .send({ product: productId, quantity: '40' }) // sistemle aynı
      .expect(201);

    const complete = await request(server)
      .post(`/stock/counts/${countId}/complete`)
      .set(auth)
      .expect(201);
    expect((complete.body as Envelope<{ adjustments: number }>).data.adjustments).toBe(0);
    expect(Number(await stockOf(auth, productId))).toBe(40);

    const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
    try {
      const countMovements = await prisma.stockMovement.count({
        where: { productId, stockCountId: countId },
      });
      expect(countMovements).toBe(0); // hiç COUNT_ADJUSTMENT üretilmedi
    } finally {
      await prisma.$disconnect();
    }
  });
});

describe('cross-tenant stok izolasyonu', () => {
  it('B tenant, A tenant’ın stok hareketini/sayımını göremez', async () => {
    const tenantA = await registerTenant('FAZ4-GAP Cross A');
    const tenantB = await registerTenant('FAZ4-GAP Cross B');
    const authA = authHeader(tenantA.accessToken);
    const authB = authHeader(tenantB.accessToken);
    const unitIdA = await getUnitId(authA);
    const productId = await createProduct(authA, unitIdA, 'A Tenant Stok Ürünü');

    await request(server)
      .post('/stock/waste')
      .set(authA)
      .send({ productId, quantity: '1', reason: 'A hareketi' })
      .expect(201);

    const startA = await request(server).post('/stock/counts').set(authA).send({}).expect(201);
    const countIdA = (startA.body as Envelope<{ id: string }>).data.id;

    // B, A'nın ürün id'siyle hareket listesi sorgularsa boş görür (kendi tenant'ına daralır).
    const movementsAsB = await request(server)
      .get('/stock/movements')
      .query({ productId })
      .set(authB)
      .expect(200);
    expect((movementsAsB.body as Envelope<{ items: unknown[] }>).data.items.length).toBe(0);

    // B, A'nın sayımını id ile göremez → 404.
    await request(server).get(`/stock/counts/${countIdA}`).set(authB).expect(404);

    // B, A'nın sayımını tamamlayamaz/iptal edemez → 404.
    await request(server).post(`/stock/counts/${countIdA}/complete`).set(authB).expect(404);
    await request(server).post(`/stock/counts/${countIdA}/cancel`).set(authB).expect(404);

    // B, A'nın ürününe kalem giremez → ürün bulunamadı (404), B'nin kendi tenant'ında yok.
    const startB = await request(server).post('/stock/counts').set(authB).send({}).expect(201);
    const countIdB = (startB.body as Envelope<{ id: string }>).data.id;
    await request(server)
      .post(`/stock/counts/${countIdB}/items`)
      .set(authB)
      .send({ product: productId, quantity: '1' })
      .expect(404);

    // A'nın verisi hâlâ sağlam.
    const stillThere = await request(server)
      .get(`/stock/counts/${countIdA}`)
      .set(authA)
      .expect(200);
    expect((stillThere.body as Envelope<{ id: string }>).data.id).toBe(countIdA);
  });
});

describe('kritik seviye listesi', () => {
  it('/stock/low yalnız kritik seviyenin altındaki ürünleri döndürür', async () => {
    const tenant = await registerTenant('FAZ4-GAP Kritik');
    const auth = authHeader(tenant.accessToken);
    const unitId = await getUnitId(auth);

    // Kritik seviyesi 10, stok 20 → listede olmamalı.
    const aboveId = await createProduct(auth, unitId, 'Kritik Üstü Ürün', '10');
    await request(server)
      .post('/stock/adjust')
      .set(auth)
      .send({ productId: aboveId, newQuantity: '20', reason: 'giriş' })
      .expect(201);

    // Kritik seviyesi 10, stok 5 (fire ile düşürülüyor) → listede olmalı.
    const belowId = await createProduct(auth, unitId, 'Kritik Altı Ürün', '10');
    await request(server)
      .post('/stock/adjust')
      .set(auth)
      .send({ productId: belowId, newQuantity: '20', reason: 'giriş' })
      .expect(201);
    await request(server)
      .post('/stock/waste')
      .set(auth)
      .send({ productId: belowId, quantity: '15', reason: 'kritik altına düşür' })
      .expect(201);

    // Kritik seviyesi 0 (tanımsız) → stok 0 olsa bile listede olmamalı.
    const noCriticalId = await createProduct(auth, unitId, 'Kritiksiz Ürün', '0');
    await request(server)
      .post('/stock/waste')
      .set(auth)
      .send({ productId: noCriticalId, quantity: '0.001', reason: 'sıfıra yakın' })
      .expect(201);

    const res = await request(server).get('/stock/low').set(auth).expect(200);
    const ids = (res.body as Envelope<{ id: string }[]>).data.map((p) => p.id);
    expect(ids).toContain(belowId);
    expect(ids).not.toContain(aboveId);
    expect(ids).not.toContain(noCriticalId);
  });
});
