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
let tenantId = '';
let unitId = '';

let ipCounter = 0;
const nextIp = (): string => `10.70.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;
const auth = () => ({ Authorization: `Bearer ${token}`, 'X-Forwarded-For': nextIp() });

async function createProduct(name: string, critical = '0'): Promise<string> {
  const res = await request(server)
    .post('/products')
    .set(auth())
    .send({ name, unitId, salePrice: '10.00', vatRate: 20, criticalLevel: critical })
    .expect(201);
  return (res.body as Envelope<{ id: string }>).data.id;
}

async function stockOf(productId: string): Promise<string> {
  const res = await request(server).get(`/products/${productId}`).set(auth()).expect(200);
  return String((res.body as Envelope<{ stockQuantity: string }>).data.stockQuantity);
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
      businessName: 'FAZ4 Stok Market',
      fullName: 'Test Patron',
      email: `faz4-${randomUUID()}@stokk.test`,
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
}, 60_000);

afterAll(async () => {
  const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
  await prisma.tenant.deleteMany({ where: { name: { startsWith: 'FAZ4 ' } } });
  await prisma.$disconnect();
  await app.close();
});

describe('ledger eşzamanlılık — Faz 4 doğrulaması', () => {
  it('aynı ürüne 50 paralel stok düşümü: ledger toplamı = denormalize alan', async () => {
    const productId = await createProduct('Paralel Ürün');
    // Başlangıç stoğu +100 (manuel düzeltme ile).
    await request(server)
      .post('/stock/adjust')
      .set(auth())
      .send({ productId, newQuantity: '100', reason: 'başlangıç' })
      .expect(201);

    // 50 eşzamanlı fire (-1 her biri).
    const results = await Promise.allSettled(
      Array.from({ length: 50 }, () =>
        request(server)
          .post('/stock/waste')
          .set(auth())
          .send({ productId, quantity: '1', reason: 'paralel test' }),
      ),
    );
    // Kaç istek başarılı oldu (FOR UPDATE serileştirmesi altında hepsi kabul edilir;
    // patolojik tek-satır 50-yönlü kontenşında bazıları pool/timeout'a takılabilir —
    // ASIL doğrulanan invaryant: lost update YOK, ledger = denormalize).
    const ok = results.filter((r) => r.status === 'fulfilled' && r.value.status === 201).length;
    expect(ok).toBeGreaterThanOrEqual(1);

    const finalStock = Number(await stockOf(productId));

    // Ledger doğrudan DB'den — invaryant kontrolleri.
    const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
    try {
      const movements = await prisma.stockMovement.findMany({
        where: { productId },
        select: { quantity: true, balanceAfter: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      });

      // 1) Ledger toplamı = denormalize alan (birebir) — Faz 4 doğrulaması.
      const sum = movements.reduce((acc, m) => acc + Number(m.quantity), 0);
      expect(sum).toBe(finalStock);

      // 2) Yalnız başarılı fire'lar uygulandı: 100 (adjust) - ok (waste) = denormalize.
      expect(finalStock).toBe(100 - ok);

      // 3) balanceAfter zinciri tutarlı: her hareket bir öncekinin üstüne oturur
      //    (lost update olsaydı zincir kopardı) — postgres-pro FOR UPDATE'i kanıtladı.
      let running = 0;
      for (const m of movements) {
        running += Number(m.quantity);
        expect(Number(m.balanceAfter)).toBe(running);
      }
    } finally {
      await prisma.$disconnect();
    }
  }, 60_000);
});

describe('fire ve manuel düzeltme', () => {
  it('fire sebep zorunlu; stok düşer, hareket geçmişine yazılır', async () => {
    const productId = await createProduct('Fireli');
    await request(server)
      .post('/stock/adjust')
      .set(auth())
      .send({ productId, newQuantity: '20', reason: 'giriş' })
      .expect(201);

    // Sebepsiz fire reddedilir.
    await request(server)
      .post('/stock/waste')
      .set(auth())
      .send({ productId, quantity: '5' })
      .expect(400);

    await request(server)
      .post('/stock/waste')
      .set(auth())
      .send({ productId, quantity: '5', reason: 'kırıldı' })
      .expect(201);

    expect(Number(await stockOf(productId))).toBe(15);

    const hist = await request(server)
      .get('/stock/movements')
      .query({ productId })
      .set(auth())
      .expect(200);
    const types = (hist.body as Envelope<{ items: { type: string }[] }>).data.items.map(
      (i) => i.type,
    );
    expect(types).toContain('WASTE');
    expect(types).toContain('MANUAL_ADJUSTMENT');
  });
});

describe('negatif stok politikası', () => {
  it('varsayılan WARN: negatife düşülebilir', async () => {
    const productId = await createProduct('Warn Ürün');
    await request(server)
      .post('/stock/waste')
      .set(auth())
      .send({ productId, quantity: '5', reason: 'stok yokken çıkış' })
      .expect(201);
    expect(Number(await stockOf(productId))).toBe(-5);
  });

  it('BLOCK ayarında negatife düşüş 400', async () => {
    const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
    await prisma.tenantSettings.updateMany({
      where: { tenantId },
      data: { negativeStockPolicy: 'BLOCK' },
    });
    await prisma.$disconnect();

    const productId = await createProduct('Block Ürün');
    const res = await request(server)
      .post('/stock/waste')
      .set(auth())
      .send({ productId, quantity: '5', reason: 'engellenecek' })
      .expect(400);
    expect((res.body as Envelope<never>).error?.code).toBe('NEGATIVE_STOCK_BLOCKED');

    // Ayarı geri al.
    const prisma2 = createPrismaClient(process.env.DATABASE_URL ?? '');
    await prisma2.tenantSettings.updateMany({
      where: { tenantId },
      data: { negativeStockPolicy: 'WARN' },
    });
    await prisma2.$disconnect();
  });
});

describe('sayım akışı', () => {
  it('tamamlanınca tek düzeltme hareketi; ara adımlarda stok değişmez', async () => {
    const productId = await createProduct('Sayım Ürünü');
    await request(server)
      .post('/stock/adjust')
      .set(auth())
      .send({ productId, newQuantity: '30', reason: 'giriş' })
      .expect(201);

    const start = await request(server)
      .post('/stock/counts')
      .set(auth())
      .send({ note: 'aylık sayım' })
      .expect(201);
    const countId = (start.body as Envelope<{ id: string }>).data.id;

    // Kalem gir: sayılan 28 (2 eksik). Ara adımda stok değişmemeli.
    await request(server)
      .post(`/stock/counts/${countId}/items`)
      .set(auth())
      .send({ product: productId, quantity: '28' })
      .expect(201);
    expect(Number(await stockOf(productId))).toBe(30); // sayım devam ederken stok sabit

    // Tamamla → tek COUNT_ADJUSTMENT hareketi.
    const complete = await request(server)
      .post(`/stock/counts/${countId}/complete`)
      .set(auth())
      .expect(201);
    expect((complete.body as Envelope<{ adjustments: number }>).data.adjustments).toBe(1);
    expect(Number(await stockOf(productId))).toBe(28);

    const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
    try {
      const countMovements = await prisma.stockMovement.count({
        where: { productId, stockCountId: countId, type: 'COUNT_ADJUSTMENT' },
      });
      expect(countMovements).toBe(1); // tek düzeltme hareketi
    } finally {
      await prisma.$disconnect();
    }
  }, 30_000);

  it('iptal edilen sayım stok değiştirmez', async () => {
    const productId = await createProduct('İptal Ürünü');
    await request(server)
      .post('/stock/adjust')
      .set(auth())
      .send({ productId, newQuantity: '10', reason: 'giriş' })
      .expect(201);

    const start = await request(server).post('/stock/counts').set(auth()).send({}).expect(201);
    const countId = (start.body as Envelope<{ id: string }>).data.id;
    await request(server)
      .post(`/stock/counts/${countId}/items`)
      .set(auth())
      .send({ product: productId, quantity: '99' })
      .expect(201);
    await request(server).post(`/stock/counts/${countId}/cancel`).set(auth()).expect(204);

    expect(Number(await stockOf(productId))).toBe(10); // değişmedi
  });
});

describe('sayım yarış güvenliği', () => {
  it('çift tamamlama: yalnız biri geçer, çift düzeltme olmaz', async () => {
    const productId = await createProduct('Çift Tamamlama');
    await request(server)
      .post('/stock/adjust')
      .set(auth())
      .send({ productId, newQuantity: '40', reason: 'giriş' })
      .expect(201);

    const start = await request(server).post('/stock/counts').set(auth()).send({}).expect(201);
    const countId = (start.body as Envelope<{ id: string }>).data.id;
    await request(server)
      .post(`/stock/counts/${countId}/items`)
      .set(auth())
      .send({ product: productId, quantity: '35' })
      .expect(201);

    // İki eşzamanlı complete.
    const results = await Promise.allSettled([
      request(server).post(`/stock/counts/${countId}/complete`).set(auth()),
      request(server).post(`/stock/counts/${countId}/complete`).set(auth()),
    ]);
    const codes = results.map((r) => (r.status === 'fulfilled' ? r.value.status : 0));
    // Tam olarak biri 201, diğeri 409.
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(1);

    // Stok tek düzeltme kadar değişmeli: 40 → 35 (çift değil).
    expect(Number(await stockOf(productId))).toBe(35);

    const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
    try {
      const adj = await prisma.stockMovement.count({
        where: { productId, stockCountId: countId, type: 'COUNT_ADJUSTMENT' },
      });
      expect(adj).toBe(1); // çift değil, tek
    } finally {
      await prisma.$disconnect();
    }
  }, 30_000);
});
