import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import exceljs from 'exceljs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPrismaClient } from '@stokk/db';

import { AppModule } from '../src/app.module.js';

// exceljs CommonJS; ESM'de named import runtime'da patlıyor, default'tan alınıyor.
// eslint-disable-next-line import-x/no-named-as-default-member
const { Workbook } = exceljs;

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
const nextIp = (): string => `10.60.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;
const auth = () => ({ Authorization: `Bearer ${token}`, 'X-Forwarded-For': nextIp() });

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
      businessName: 'FAZ3 Test Market',
      fullName: 'Test Patron',
      email: `faz3-${randomUUID()}@stokk.test`,
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
  await prisma.tenant.deleteMany({ where: { name: { startsWith: 'FAZ3 ' } } });
  await prisma.$disconnect();
  await app.close();
});

describe('kategori / marka / birim CRUD', () => {
  it('kullanımdaki kategori silinemez (409)', async () => {
    const cat = await request(server)
      .post('/categories')
      .set(auth())
      .send({ name: `Kategori ${randomUUID().slice(0, 6)}` })
      .expect(201);
    const categoryId = (cat.body as Envelope<{ id: string }>).data.id;

    await request(server)
      .post('/products')
      .set(auth())
      .send({ name: 'Kategorili Ürün', unitId, categoryId, salePrice: '10.00', vatRate: 20 })
      .expect(201);

    const del = await request(server).delete(`/categories/${categoryId}`).set(auth()).expect(409);
    expect((del.body as Envelope<never>).error?.code).toBe('CONFLICT');
  });
});

describe('ürün & barkod', () => {
  it('aynı barkod ikinci kez → 409', async () => {
    const barcode = `869${randomUUID().slice(0, 10)}`;
    await request(server)
      .post('/products')
      .set(auth())
      .send({ name: 'Barkodlu 1', unitId, salePrice: '5.00', vatRate: 20, barcodes: [barcode] })
      .expect(201);

    const dup = await request(server)
      .post('/products')
      .set(auth())
      .send({ name: 'Barkodlu 2', unitId, salePrice: '6.00', vatRate: 20, barcodes: [barcode] })
      .expect(409);
    expect((dup.body as Envelope<never>).error?.code).toBe('CONFLICT');
  });

  it('KDV oranı tenant listesinde yoksa reddedilir', async () => {
    const res = await request(server)
      .post('/products')
      .set(auth())
      .send({ name: 'Yanlış KDV', unitId, salePrice: '5.00', vatRate: 37 })
      .expect(400);
    expect((res.body as Envelope<never>).error?.code).toBe('INVALID_VAT_RATE');
  });
});

describe('arama başarımı (5.000 ürün)', () => {
  it('5.000 ürün seed edilir ve ad/barkod araması < 100 ms döner', async () => {
    const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
    try {
      // Doğrudan (sahip rolü) toplu seed — API üzerinden 5000 istek yerine.
      const data = Array.from({ length: 5000 }, (_, i) => ({
        tenantId,
        name: `Test Ürün ${i} ${['Çay', 'Süt', 'Ekmek', 'Zeytin'][i % 4]}`,
        code: `SKU-${i}`,
        unitId,
        salePrice: `${(i % 100) + 1}.00`,
        vatRate: [1, 10, 20][i % 3] ?? 20,
      }));
      await prisma.product.createMany({ data });

      const start = performance.now();
      const res = await request(server)
        .get('/products')
        .query({ search: 'Zeytin', limit: 20 })
        .set(auth())
        .expect(200);
      const elapsed = performance.now() - start;

      const body = res.body as Envelope<{ items: unknown[]; meta: { total: number } }>;
      expect(body.data.meta.total).toBeGreaterThan(1000); // ~1250 "Zeytin"
      expect(elapsed).toBeLessThan(100);
    } finally {
      await prisma.$disconnect();
    }
  }, 60_000);
});

describe('Excel import (kısmi başarı)', () => {
  it('1.000 satırlık dosyada 3 hatalı satır raporlanır, 997 ürün oluşur', async () => {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('Ürünler');
    sheet.addRow(['Ad', 'Kod', 'Birim', 'Satış Fiyatı', 'KDV', 'Barkod']);

    for (let i = 0; i < 1000; i += 1) {
      // 3 satırı bilerek boz: 100 geçersiz fiyat, 500 geçersiz KDV, 900 olmayan birim
      const price = i === 100 ? 'abc' : '12.50';
      const vat = i === 500 ? '99x' : '20';
      const unit = i === 900 ? 'yokbirim' : 'ad';
      sheet.addRow([`Import Ürün ${i}`, `IMP-${randomUUID().slice(0, 8)}`, unit, price, vat, '']);
    }
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const res = await request(server)
      .post('/products/import')
      .set(auth())
      .attach('file', buffer, 'urunler.xlsx')
      .expect(201);
    const jobId = (res.body as Envelope<{ jobId: string }>).data.jobId;

    // Worker asenkron; tamamlanana kadar bekle.
    let status: { status: string; createdCount: number; errorCount: number } | undefined;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const poll = await request(server).get(`/products/import/${jobId}`).set(auth()).expect(200);
      status = (poll.body as Envelope<typeof status>).data;
      if (status?.status === 'COMPLETED' || status?.status === 'FAILED') break;
      await new Promise((r) => setTimeout(r, 500));
    }

    expect(status?.status).toBe('COMPLETED');
    expect(status?.errorCount).toBe(3);
    expect(status?.createdCount).toBe(997);
  }, 60_000);
});
