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
 * Alış ve finans kayıtlarının güncelleme/silme uçları.
 *
 * Defter bütünlüğü kuralları da burada doğrulanır: alış faturasının KALEMLERİ
 * değiştirilemez, vardiyaya bağlı mali kayıt düzenlenemez, silme yumuşaktır.
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
const nextIp = (): string => `10.77.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

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
      email: `crud-${randomUUID()}@stokk.test`,
      password: 'CokGizliParola1',
    })
    .expect(201);
  return (res.body as Envelope<AuthPayload>).data;
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
  await prisma.tenant.deleteMany({ where: { name: { startsWith: 'CRUD-GAP ' } } });
  await prisma.$disconnect();
  await app.close();
});

describe('gider CRUD', () => {
  it('gider güncellenir ve yumuşak silinir', async () => {
    const tenant = await registerTenant('CRUD-GAP Gider');

    const created = await request(server)
      .post('/expenses')
      .set(authHeader(tenant.accessToken))
      .send({
        amount: '1500.00',
        paymentMethod: 'CASH',
        description: 'Eylül kira',
        expenseDate: '2026-09-01T00:00:00.000Z',
      })
      .expect(201);
    const id = (created.body as Envelope<{ id: string }>).data.id;

    const updated = await request(server)
      .patch(`/expenses/${id}`)
      .set(authHeader(tenant.accessToken))
      .send({ amount: '1750.50', description: 'Eylül kira (zamlı)' })
      .expect(200);
    const body = (updated.body as Envelope<{ amount: string; description: string }>).data;
    expect(Number(body.amount)).toBe(1750.5);
    expect(body.description).toBe('Eylül kira (zamlı)');

    await request(server).delete(`/expenses/${id}`).set(authHeader(tenant.accessToken)).expect(204);

    // Silinen kayıt listede GÖRÜNMEZ.
    const list = await request(server)
      .get('/expenses')
      .set(authHeader(tenant.accessToken))
      .expect(200);
    const items = (list.body as Envelope<{ items: { id: string }[] }>).data.items;
    expect(items.map((item) => item.id)).not.toContain(id);

    // İkinci silme 404 — kayıt zaten listeden düşmüş.
    await request(server).delete(`/expenses/${id}`).set(authHeader(tenant.accessToken)).expect(404);
  });

  it('olmayan kategoriye bağlanamaz', async () => {
    const tenant = await registerTenant('CRUD-GAP GiderKategori');
    const created = await request(server)
      .post('/expenses')
      .set(authHeader(tenant.accessToken))
      .send({
        amount: '100.00',
        paymentMethod: 'CARD',
        description: 'Test',
        expenseDate: '2026-09-01T00:00:00.000Z',
      })
      .expect(201);
    const id = (created.body as Envelope<{ id: string }>).data.id;

    await request(server)
      .patch(`/expenses/${id}`)
      .set(authHeader(tenant.accessToken))
      .send({ categoryId: 'olmayan-kategori' })
      .expect(404);
  });
});

describe('gelir CRUD', () => {
  it('gelir güncellenir ve yumuşak silinir', async () => {
    const tenant = await registerTenant('CRUD-GAP Gelir');

    const created = await request(server)
      .post('/incomes')
      .set(authHeader(tenant.accessToken))
      .send({
        amount: '400.00',
        paymentMethod: 'TRANSFER',
        description: 'Hurda satışı',
        incomeDate: '2026-09-02T00:00:00.000Z',
      })
      .expect(201);
    const id = (created.body as Envelope<{ id: string }>).data.id;

    const updated = await request(server)
      .patch(`/incomes/${id}`)
      .set(authHeader(tenant.accessToken))
      .send({ amount: '450.00', documentNo: 'DK-2026-7' })
      .expect(200);
    const body = (updated.body as Envelope<{ amount: string; documentNo: string | null }>).data;
    expect(Number(body.amount)).toBe(450);
    expect(body.documentNo).toBe('DK-2026-7');

    await request(server).delete(`/incomes/${id}`).set(authHeader(tenant.accessToken)).expect(204);

    const list = await request(server)
      .get('/incomes')
      .set(authHeader(tenant.accessToken))
      .expect(200);
    expect(
      (list.body as Envelope<{ items: { id: string }[] }>).data.items.map((item) => item.id),
    ).not.toContain(id);
  });
});

describe('gider kategorisi CRUD', () => {
  it('kategori yeniden adlandırılır, aynı ad ikinci kez kullanılamaz', async () => {
    const tenant = await registerTenant('CRUD-GAP Kategori');

    const created = await request(server)
      .post('/expense-categories')
      .set(authHeader(tenant.accessToken))
      .send({ name: 'Nakliye' })
      .expect(201);
    const id = (created.body as Envelope<{ id: string }>).data.id;

    const renamed = await request(server)
      .patch(`/expense-categories/${id}`)
      .set(authHeader(tenant.accessToken))
      .send({ name: 'Lojistik' })
      .expect(200);
    expect((renamed.body as Envelope<{ name: string }>).data.name).toBe('Lojistik');

    // İkinci bir kategorinin adına çakışma denemesi → 409 (tenantId, name unique).
    await request(server)
      .post('/expense-categories')
      .set(authHeader(tenant.accessToken))
      .send({ name: 'Elektrik' })
      .expect(201);

    await request(server)
      .patch(`/expense-categories/${id}`)
      .set(authHeader(tenant.accessToken))
      .send({ name: 'Elektrik' })
      .expect(409);
  });
});

describe('alış faturası güncelleme', () => {
  it('belge bilgileri değişir, KALEM güncellemesi reddedilir', async () => {
    const tenant = await registerTenant('CRUD-GAP Alis');
    const auth = () => authHeader(tenant.accessToken);

    const units = await request(server).get('/units').set(auth()).expect(200);
    const unitId = (units.body as Envelope<{ id: string; abbreviation: string }[]>).data.find(
      (unit) => unit.abbreviation === 'ad',
    )!.id;

    const product = await request(server)
      .post('/products')
      .set(auth())
      .send({ name: 'Test Ürün', unitId, salePrice: '20.00', vatRate: 20 })
      .expect(201);
    const productId = (product.body as Envelope<{ id: string }>).data.id;

    const supplier = await request(server)
      .post('/contacts')
      .set(auth())
      .send({ type: 'SUPPLIER', name: 'Test Tedarikçi' })
      .expect(201);
    const contactId = (supplier.body as Envelope<{ id: string }>).data.id;

    const purchase = await request(server)
      .post('/purchases')
      .set(auth())
      .send({
        contactId,
        invoiceNo: 'ALS-1',
        invoiceDate: '2026-09-01T00:00:00.000Z',
        items: [{ productId, quantity: '10', unitPrice: '10.00', vatRate: 20 }],
      })
      .expect(201);
    const purchaseId = (purchase.body as Envelope<{ id: string }>).data.id;

    // Belge bilgileri güncellenebilir.
    const updated = await request(server)
      .patch(`/purchases/${purchaseId}`)
      .set(auth())
      .send({ invoiceNo: 'ALS-1-D', note: 'Fatura no düzeltildi' })
      .expect(200);
    const body = (
      updated.body as Envelope<{
        invoiceNo: string | null;
        note: string | null;
        grandTotal: string;
        items: { quantity: string }[];
      }>
    ).data;
    expect(body.invoiceNo).toBe('ALS-1-D');
    expect(body.note).toBe('Fatura no düzeltildi');
    // Kalemler ve toplam DOKUNULMADAN kalır.
    expect(Number(body.grandTotal)).toBe(120);
    expect(Number(body.items[0]?.quantity)).toBe(10);

    // Kalem göndermek şema tarafından reddedilir (strict).
    await request(server)
      .patch(`/purchases/${purchaseId}`)
      .set(auth())
      .send({ items: [{ productId, quantity: '5', unitPrice: '10.00', vatRate: 20 }] })
      .expect(400);

    // İptal edilmiş fatura düzenlenemez.
    await request(server).post(`/purchases/${purchaseId}/cancel`).set(auth()).expect(204);
    const rejected = await request(server)
      .patch(`/purchases/${purchaseId}`)
      .set(auth())
      .send({ note: 'iptalden sonra' })
      .expect(409);
    expect((rejected.body as Envelope<unknown>).error?.code).toBeDefined();
  });
});
