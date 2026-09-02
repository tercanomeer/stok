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
 * Faz 3 doğrulama denetiminde tespit edilen boşlukları kapatan ek e2e testleri.
 * `products.e2e.spec.ts` ile aynı desen: gerçek Postgres/Redis, X-Forwarded-For
 * ile IP izolasyonu, "FAZ3-GAP " ön ekli tenant adı + afterAll temizliği.
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
const nextIp = (): string => `10.61.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

async function registerTenant(businessName: string): Promise<AuthPayload> {
  const res = await request(server)
    .post('/auth/register')
    .set('X-Forwarded-For', nextIp())
    .send({
      businessName,
      fullName: 'Test Patron',
      email: `faz3-gap-${randomUUID()}@stokk.test`,
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

const authHeader = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'X-Forwarded-For': nextIp(),
});

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  app.set('trust proxy', true);
  await app.init();
  server = app.getHttpServer() as Server;
}, 60_000);

afterAll(async () => {
  const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
  await prisma.tenant.deleteMany({ where: { name: { startsWith: 'FAZ3-GAP ' } } });
  await prisma.$disconnect();
  await app.close();
});

describe('barkod arama', () => {
  it('ürüne eklenen barkod ile /products?search= üzerinden bulunur', async () => {
    const tenant = await registerTenant('FAZ3-GAP Barkod');
    const auth = authHeader(tenant.accessToken);
    const unitId = await getUnitId(auth);
    const barcode = `8699${randomUUID().slice(0, 9)}`;

    const created = await request(server)
      .post('/products')
      .set(authHeader(tenant.accessToken))
      .send({
        name: 'Barkodla Aranan Ürün',
        unitId,
        salePrice: '15.00',
        vatRate: 20,
        barcodes: [barcode],
      })
      .expect(201);
    const productId = (created.body as Envelope<{ id: string }>).data.id;

    const res = await request(server)
      .get('/products')
      .query({ search: barcode })
      .set(authHeader(tenant.accessToken))
      .expect(200);
    const body = (res.body as Envelope<{ items: { id: string }[]; meta: { total: number } }>).data;

    expect(body.meta.total).toBe(1);
    expect(body.items[0]?.id).toBe(productId);
  });
});

describe('Türkçe arama duyarsızlığı', () => {
  it("küçük harf 'çay' araması büyük harfli 'Çay' ürününü bulur", async () => {
    const tenant = await registerTenant('FAZ3-GAP Turkce');
    const auth = authHeader(tenant.accessToken);
    const unitId = await getUnitId(auth);

    await request(server)
      .post('/products')
      .set(authHeader(tenant.accessToken))
      .send({ name: 'Çaykur Rize Çayı', unitId, salePrice: '40.00', vatRate: 1 })
      .expect(201);

    const res = await request(server)
      .get('/products')
      .query({ search: 'çay' })
      .set(authHeader(tenant.accessToken))
      .expect(200);
    const body = (res.body as Envelope<{ items: { name: string }[]; meta: { total: number } }>)
      .data;

    expect(body.meta.total).toBeGreaterThanOrEqual(1);
    expect(body.items.some((p) => p.name === 'Çaykur Rize Çayı')).toBe(true);
  });
});

describe('toplu fiyat güncelleme', () => {
  it('önizleme veritabanını değiştirmez, uygulama fiyatı ve geçmişi günceller', async () => {
    const tenant = await registerTenant('FAZ3-GAP BulkFiyat');
    const auth = authHeader(tenant.accessToken);
    const unitId = await getUnitId(auth);

    const p1 = await request(server)
      .post('/products')
      .set(authHeader(tenant.accessToken))
      .send({ name: 'Bulk Ürün 1', unitId, salePrice: '100.00', vatRate: 20 })
      .expect(201);
    const p2 = await request(server)
      .post('/products')
      .set(authHeader(tenant.accessToken))
      .send({ name: 'Bulk Ürün 2', unitId, salePrice: '50.00', vatRate: 20 })
      .expect(201);
    const id1 = (p1.body as Envelope<{ id: string }>).data.id;
    const id2 = (p2.body as Envelope<{ id: string }>).data.id;

    // Önizleme: %10 zam, DB değişmemeli.
    const preview = await request(server)
      .post('/products/bulk-price')
      .set(authHeader(tenant.accessToken))
      .send({ productIds: [id1, id2], mode: 'percent', value: '10', preview: true })
      .expect(201);
    const previewBody = (
      preview.body as Envelope<{
        preview: boolean;
        affected: number;
        items: { newPrice: string }[];
      }>
    ).data;
    expect(previewBody.preview).toBe(true);
    expect(previewBody.affected).toBe(2);

    const untouched = await request(server)
      .get(`/products/${id1}`)
      .set(authHeader(tenant.accessToken))
      .expect(200);
    expect(Number((untouched.body as Envelope<{ salePrice: string }>).data.salePrice)).toBe(100);

    // Gerçek uygulama: %10 zam → 110.00 / 55.00
    const apply = await request(server)
      .post('/products/bulk-price')
      .set(authHeader(tenant.accessToken))
      .send({ productIds: [id1, id2], mode: 'percent', value: '10', preview: false })
      .expect(201);
    expect((apply.body as Envelope<{ affected: number }>).data.affected).toBe(2);

    const after1 = await request(server)
      .get(`/products/${id1}`)
      .set(authHeader(tenant.accessToken))
      .expect(200);
    expect(Number((after1.body as Envelope<{ salePrice: string }>).data.salePrice)).toBe(110);

    const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
    try {
      const history = await prisma.productPriceHistory.findMany({
        where: { productId: id1, tenantId: tenant.user.tenantId },
      });
      expect(history).toHaveLength(1);
      expect(history[0]?.oldPrice.toString()).toBe('100');
      expect(history[0]?.newPrice.toString()).toBe('110');
    } finally {
      await prisma.$disconnect();
    }

    // Negatif sonuç → 0'a sabitlenir (tutar modunda büyük bir indirim).
    const clamp = await request(server)
      .post('/products/bulk-price')
      .set(authHeader(tenant.accessToken))
      .send({ productIds: [id2], mode: 'amount', value: '-999', preview: false })
      .expect(201);
    expect((clamp.body as Envelope<{ affected: number }>).data.affected).toBe(1);

    const after2 = await request(server)
      .get(`/products/${id2}`)
      .set(authHeader(tenant.accessToken))
      .expect(200);
    expect(Number((after2.body as Envelope<{ salePrice: string }>).data.salePrice)).toBe(0);
  });
});

describe('kullanımdaki marka / birim silinemez', () => {
  it('kullanımdaki marka silinemez (409)', async () => {
    const tenant = await registerTenant('FAZ3-GAP Marka');
    const auth = authHeader(tenant.accessToken);
    const unitId = await getUnitId(auth);

    const brand = await request(server)
      .post('/brands')
      .set(authHeader(tenant.accessToken))
      .send({ name: `Marka ${randomUUID().slice(0, 6)}` })
      .expect(201);
    const brandId = (brand.body as Envelope<{ id: string }>).data.id;

    await request(server)
      .post('/products')
      .set(authHeader(tenant.accessToken))
      .send({ name: 'Markalı Ürün', unitId, brandId, salePrice: '10.00', vatRate: 20 })
      .expect(201);

    const del = await request(server)
      .delete(`/brands/${brandId}`)
      .set(authHeader(tenant.accessToken))
      .expect(409);
    expect((del.body as Envelope<never>).error?.code).toBe('CONFLICT');
  });

  it('kullanımdaki birim silinemez (409)', async () => {
    const tenant = await registerTenant('FAZ3-GAP Birim');

    const unit = await request(server)
      .post('/units')
      .set(authHeader(tenant.accessToken))
      .send({ name: `Birim ${randomUUID().slice(0, 6)}`, abbreviation: randomUUID().slice(0, 4) })
      .expect(201);
    const unitId = (unit.body as Envelope<{ id: string }>).data.id;

    await request(server)
      .post('/products')
      .set(authHeader(tenant.accessToken))
      .send({ name: 'Birimli Ürün', unitId, salePrice: '10.00', vatRate: 20 })
      .expect(201);

    const del = await request(server)
      .delete(`/units/${unitId}`)
      .set(authHeader(tenant.accessToken))
      .expect(409);
    expect((del.body as Envelope<never>).error?.code).toBe('CONFLICT');
  });
});

describe('cross-tenant ürün izolasyonu', () => {
  it('başka tenant’ın ürününe GET/PATCH/DELETE 404 döner', async () => {
    const tenantA = await registerTenant('FAZ3-GAP Cross A');
    const tenantB = await registerTenant('FAZ3-GAP Cross B');
    const unitIdA = await getUnitId(authHeader(tenantA.accessToken));

    const product = await request(server)
      .post('/products')
      .set(authHeader(tenantA.accessToken))
      .send({ name: 'A Tenant Ürünü', unitId: unitIdA, salePrice: '25.00', vatRate: 20 })
      .expect(201);
    const productId = (product.body as Envelope<{ id: string }>).data.id;

    await request(server)
      .get(`/products/${productId}`)
      .set(authHeader(tenantB.accessToken))
      .expect(404);

    await request(server)
      .patch(`/products/${productId}`)
      .set(authHeader(tenantB.accessToken))
      .send({ salePrice: '1.00' })
      .expect(404);

    await request(server)
      .delete(`/products/${productId}`)
      .set(authHeader(tenantB.accessToken))
      .expect(404);

    // A tenant'ından hâlâ değişmemiş olarak okunabilmeli.
    const stillThere = await request(server)
      .get(`/products/${productId}`)
      .set(authHeader(tenantA.accessToken))
      .expect(200);
    expect(Number((stillThere.body as Envelope<{ salePrice: string }>).data.salePrice)).toBe(25);
  });
});

describe('soft delete', () => {
  it('silinen ürün listede görünmez', async () => {
    const tenant = await registerTenant('FAZ3-GAP SoftDelete');
    const auth = authHeader(tenant.accessToken);
    const unitId = await getUnitId(auth);
    const uniqueName = `Silinecek Ürün ${randomUUID().slice(0, 8)}`;

    const product = await request(server)
      .post('/products')
      .set(authHeader(tenant.accessToken))
      .send({ name: uniqueName, unitId, salePrice: '30.00', vatRate: 20 })
      .expect(201);
    const productId = (product.body as Envelope<{ id: string }>).data.id;

    await request(server)
      .delete(`/products/${productId}`)
      .set(authHeader(tenant.accessToken))
      .expect(204);

    await request(server)
      .get(`/products/${productId}`)
      .set(authHeader(tenant.accessToken))
      .expect(404);

    const list = await request(server)
      .get('/products')
      .query({ search: uniqueName })
      .set(authHeader(tenant.accessToken))
      .expect(200);
    expect((list.body as Envelope<{ meta: { total: number } }>).data.meta.total).toBe(0);
  });
});

describe('soft-delete barkodu serbest bırakır', () => {
  it('silinen ürünün barkodu yeni üründe tekrar kullanılabilir', async () => {
    const tenant = await registerTenant('FAZ3-GAP Barkod');
    const unitId = await getUnitId(authHeader(tenant.accessToken));
    const barcode = `8691${randomUUID().slice(0, 9)}`;

    const created = await request(server)
      .post('/products')
      .set(authHeader(tenant.accessToken))
      .send({ name: 'Silinecek', unitId, salePrice: '10.00', vatRate: 20, barcodes: [barcode] })
      .expect(201);
    const productId = (created.body as Envelope<{ id: string }>).data.id;

    await request(server)
      .delete(`/products/${productId}`)
      .set(authHeader(tenant.accessToken))
      .expect(204);

    // Aynı barkod artık serbest — yeni ürün oluşturulabilmeli (409 DEĞİL 201).
    await request(server)
      .post('/products')
      .set(authHeader(tenant.accessToken))
      .send({ name: 'Yeni Ürün', unitId, salePrice: '12.00', vatRate: 20, barcodes: [barcode] })
      .expect(201);
  });
});

describe('etiket PDF ve görsel yükleme', () => {
  it('barkod etiketi PDF üretir (bwip-js + pdfkit → MinIO)', async () => {
    const tenant = await registerTenant('FAZ3-GAP Etiket');
    const unitId = await getUnitId(authHeader(tenant.accessToken));

    const created = await request(server)
      .post('/products')
      .set(authHeader(tenant.accessToken))
      .send({
        name: 'Etiketli',
        unitId,
        salePrice: '25.00',
        vatRate: 20,
        barcodes: [`8690${randomUUID().slice(0, 9)}`],
      })
      .expect(201);
    const productId = (created.body as Envelope<{ id: string }>).data.id;

    const res = await request(server)
      .post('/products/labels')
      .set(authHeader(tenant.accessToken))
      .send({ productIds: [productId] })
      .expect(201);

    const data = (res.body as Envelope<{ url: string; count: number }>).data;
    expect(data.count).toBe(1);
    expect(data.url).toContain('.pdf');
  });

  it('görsel yükler; geçersiz tipi 400 reddeder', async () => {
    const tenant = await registerTenant('FAZ3-GAP Görsel');
    const unitId = await getUnitId(authHeader(tenant.accessToken));

    const created = await request(server)
      .post('/products')
      .set(authHeader(tenant.accessToken))
      .send({ name: 'Görselli', unitId, salePrice: '30.00', vatRate: 20 })
      .expect(201);
    const productId = (created.body as Envelope<{ id: string }>).data.id;

    // 1x1 PNG.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const ok = await request(server)
      .post(`/products/${productId}/image`)
      .set(authHeader(tenant.accessToken))
      .attach('file', png, { filename: 'p.png', contentType: 'image/png' })
      .expect(200);
    expect((ok.body as Envelope<{ imageUrl: string }>).data.imageUrl).toContain('products/');

    const bad = await request(server)
      .post(`/products/${productId}/image`)
      .set(authHeader(tenant.accessToken))
      .attach('file', Buffer.from('merhaba'), { filename: 'x.txt', contentType: 'text/plain' })
      .expect(400);
    expect((bad.body as Envelope<never>).error?.code).toBe('VALIDATION_FAILED');
  });
});

describe('Türkçe sıralama sayfalama', () => {
  it('sayfa 1 Türkçe sırada gerçekten ilk ürünleri döndürür', async () => {
    const tenant = await registerTenant('FAZ3-GAP Sıralama');
    const unitId = await getUnitId(authHeader(tenant.accessToken));

    // Türkçe alfabede: Çilek < Iğdır < Şeker < Zeytin < zzz.
    // C/POSIX sırasında büyük harfli Türkçe karakterler farklı yerde gelir.
    const names = ['Zeytin', 'Çilek', 'Şeker', 'Iğdır', 'Armut', 'Üzüm', 'Öküz', 'İncir'];
    for (const name of names) {
      await request(server)
        .post('/products')
        .set(authHeader(tenant.accessToken))
        .send({ name, unitId, salePrice: '10.00', vatRate: 20 })
        .expect(201);
    }

    // limit=3, page=1 — Türkçe sırada ilk 3.
    const page1 = await request(server)
      .get('/products')
      .query({ sort: 'name:asc', limit: 3, page: 1 })
      .set(authHeader(tenant.accessToken))
      .expect(200);
    const firstThree = (page1.body as Envelope<{ items: { name: string }[] }>).data.items.map(
      (i) => i.name,
    );

    // Türkçe collator ile beklenen ilk 3.
    const expected = [...names].sort((a, b) => new Intl.Collator('tr').compare(a, b)).slice(0, 3);
    expect(firstThree).toEqual(expected);

    // page=2'de page=1'deki ürünler TEKRAR görünmemeli (sayfalama tutarlı).
    const page2 = await request(server)
      .get('/products')
      .query({ sort: 'name:asc', limit: 3, page: 2 })
      .set(authHeader(tenant.accessToken))
      .expect(200);
    const nextThree = (page2.body as Envelope<{ items: { name: string }[] }>).data.items.map(
      (i) => i.name,
    );
    expect(nextThree.some((n) => firstThree.includes(n))).toBe(false);
  });
});
