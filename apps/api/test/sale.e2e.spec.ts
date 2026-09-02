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
let unitId = '';
let registerId = '';
let sessionId = '';

let ipCounter = 0;
const nextIp = (): string => `10.90.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;
const auth = (t = token) => ({ Authorization: `Bearer ${t}`, 'X-Forwarded-For': nextIp() });

async function createProduct(name: string, salePrice = '10.00', vatRate = 20): Promise<string> {
  const res = await request(server)
    .post('/products')
    .set(auth())
    .send({ name, unitId, salePrice, vatRate })
    .expect(201);
  const id = (res.body as Envelope<{ id: string }>).data.id;
  // Başlangıç stoğu ver.
  await request(server)
    .post('/stock/adjust')
    .set(auth())
    .send({ productId: id, newQuantity: '1000', reason: 'FAZ6 başlangıç' })
    .expect(201);
  return id;
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

/** SALE_DISCOUNT_HIGH / SALE_CREDIT_OVER_LIMIT izni OLMAYAN kasiyer token'ı. */
async function createCashierToken(): Promise<string> {
  const roles = await request(server).get('/roles').set(auth()).expect(200);
  const cashierRole = (roles.body as Envelope<{ id: string; name: string }[]>).data.find(
    (r) => r.name === 'KASIYER',
  )!;
  const email = `faz6-kasiyer-${randomUUID()}@stokk.test`;
  await request(server)
    .post('/users')
    .set(auth())
    .send({ email, password: 'KasiyerParola1', fullName: 'Kasiyer', roleIds: [cashierRole.id] })
    .expect(201);
  const login = await request(server)
    .post('/auth/login')
    .set('X-Forwarded-For', nextIp())
    .send({ email, password: 'KasiyerParola1' })
    .expect(200);
  return (login.body as Envelope<{ accessToken: string }>).data.accessToken;
}

async function stockOf(productId: string): Promise<number> {
  const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
  try {
    const p = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
      select: { stockQuantity: true },
    });
    return Number(p.stockQuantity);
  } finally {
    await prisma.$disconnect();
  }
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
      businessName: 'FAZ6 Satış Market',
      fullName: 'Test Patron',
      email: `faz6-${randomUUID()}@stokk.test`,
      password: 'CokGizliParola1',
    })
    .expect(201);
  token = (reg.body as Envelope<{ accessToken: string }>).data.accessToken;

  const units = await request(server).get('/units').set(auth()).expect(200);
  unitId = (units.body as Envelope<{ id: string; abbreviation: string }[]>).data.find(
    (u) => u.abbreviation === 'ad',
  )!.id;

  // Kayıt sırasında varsayılan "Kasa 1" zaten açılıyor; onu kullan.
  const registers = await request(server).get('/registers').set(auth()).expect(200);
  registerId = (registers.body as Envelope<{ id: string; name: string }[]>).data[0]!.id;

  const session = await request(server)
    .post('/cash-sessions')
    .set(auth())
    .send({ registerId, openingAmount: '100.00' })
    .expect(201);
  sessionId = (session.body as Envelope<{ id: string }>).data.id;
}, 60_000);

afterAll(async () => {
  const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
  await prisma.tenant.deleteMany({ where: { name: { startsWith: 'FAZ6 ' } } });
  await prisma.$disconnect();
  await app.close();
});

describe('satış oluşturma — stok + kasa + toplamlar', () => {
  it('nakit satış: stok düşer, kasa hareketi yazılır, toplamlar pos-core ile', async () => {
    const productId = await createProduct('Nakit Ürün', '12.00', 20);
    const res = await request(server)
      .post('/sales')
      .set(auth())
      .send({
        cashSessionId: sessionId,
        lines: [{ productId, quantity: '2', unitPrice: '12.00', vatRate: 20 }],
        payments: [{ method: 'CASH', amount: '24.00', receivedAmount: '50.00' }],
      })
      .expect(201);
    const sale = (res.body as Envelope<{ grandTotal: string; receiptNo: string; status: string }>)
      .data;
    expect(Number(sale.grandTotal)).toBe(24);
    expect(sale.status).toBe('COMPLETED');
    expect(await stockOf(productId)).toBe(998);

    // Kasa hareketi: satışın nakit kısmı (+24) kasaya yazıldı.
    const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
    try {
      const mv = await prisma.cashMovement.findFirst({
        where: { cashSessionId: sessionId, type: 'SALE' },
        orderBy: { createdAt: 'desc' },
        select: { amount: true },
      });
      expect(Number(mv?.amount)).toBe(24);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('parçalı ödeme: nakit + kart tek fişte, kasaya yalnız nakit kısmı yazılır', async () => {
    const productId = await createProduct('Parçalı Ödeme Ürünü', '12.00', 20);
    const res = await request(server)
      .post('/sales')
      .set(auth())
      .send({
        cashSessionId: sessionId,
        lines: [{ productId, quantity: '5', unitPrice: '12.00', vatRate: 20 }],
        payments: [
          { method: 'CASH', amount: '20.00', receivedAmount: '20.00' },
          { method: 'CARD', amount: '40.00', reference: 'POS-SLIP-1' },
        ],
      })
      .expect(201);
    const sale = (res.body as Envelope<{ id: string; grandTotal: string; status: string }>).data;
    expect(Number(sale.grandTotal)).toBe(60);
    expect(sale.status).toBe('COMPLETED');
    expect(await stockOf(productId)).toBe(995);

    // Kasaya yalnız nakit kısmı (20), kart kısmı (40) kasayı etkilemez.
    const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
    try {
      const movements = await prisma.cashMovement.findMany({
        where: { saleId: sale.id },
        select: { type: true, amount: true },
      });
      expect(movements).toHaveLength(1);
      expect(movements[0]!.type).toBe('SALE');
      expect(Number(movements[0]!.amount)).toBe(20);
    } finally {
      await prisma.$disconnect();
    }
  });

  it('ödeme toplamı fiş tutarına eşit değilse reddedilir', async () => {
    const productId = await createProduct('Uyuşmaz Ürün', '10.00', 20);
    const res = await request(server)
      .post('/sales')
      .set(auth())
      .send({
        cashSessionId: sessionId,
        lines: [{ productId, quantity: '1', unitPrice: '10.00', vatRate: 20 }],
        payments: [{ method: 'CASH', amount: '5.00' }],
      })
      .expect(400);
    expect((res.body as Envelope<never>).error?.code).toBe('PAYMENT_MISMATCH');
  });
});

describe('idempotent satış — aynı clientSaleId tekrar gönderimi', () => {
  it('aynı clientSaleId 3 kez: tek satış, tek stok düşümü', async () => {
    const productId = await createProduct('Idempotent Ürün', '10.00', 20);
    const clientSaleId = randomUUID();
    const body = {
      cashSessionId: sessionId,
      clientSaleId,
      lines: [{ productId, quantity: '3', unitPrice: '10.00', vatRate: 20 }],
      payments: [{ method: 'CASH', amount: '30.00' }],
    };

    const first = await request(server).post('/sales').set(auth()).send(body).expect(201);
    const firstId = (first.body as Envelope<{ id: string }>).data.id;
    const second = await request(server).post('/sales').set(auth()).send(body).expect(201);
    const third = await request(server).post('/sales').set(auth()).send(body).expect(201);

    // Üçü de aynı satışı döndürür.
    expect((second.body as Envelope<{ id: string }>).data.id).toBe(firstId);
    expect((third.body as Envelope<{ id: string }>).data.id).toBe(firstId);

    // Tek stok düşümü: 1000 - 3 = 997 (üç kez değil).
    expect(await stockOf(productId)).toBe(997);

    const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
    try {
      const count = await prisma.sale.count({ where: { clientSaleId } });
      expect(count).toBe(1);
      const movements = await prisma.stockMovement.count({
        where: { productId, type: 'SALE' },
      });
      expect(movements).toBe(1);
    } finally {
      await prisma.$disconnect();
    }
  });
});

describe('fiş numarası — boşluksuz ardışık, çakışmasız', () => {
  it('100 eşzamanlı satış: fiş numaraları boşluksuz ve benzersiz', async () => {
    const productId = await createProduct('Paralel Satış Ürünü', '1.00', 20);
    const results = await Promise.allSettled(
      Array.from({ length: 100 }, () =>
        request(server)
          .post('/sales')
          .set(auth())
          .send({
            cashSessionId: sessionId,
            lines: [{ productId, quantity: '1', unitPrice: '1.00', vatRate: 20 }],
            payments: [{ method: 'CASH', amount: '1.00' }],
          }),
      ),
    );
    const okIds = results
      .filter((r): r is PromiseFulfilledResult<request.Response> => r.status === 'fulfilled')
      .filter((r) => r.value.status === 201)
      .map((r) => (r.value.body as Envelope<{ id: string }>).data.id);
    expect(okIds.length).toBeGreaterThanOrEqual(1);

    // DB'den bu satışların fiş numaralarını al.
    const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
    try {
      const sales = await prisma.sale.findMany({
        where: { id: { in: okIds } },
        select: { receiptNo: true },
      });
      const numbers = sales.map((s) => Number(s.receiptNo)).sort((a, b) => a - b);
      // Benzersiz.
      expect(new Set(numbers).size).toBe(numbers.length);
      // Boşluksuz ardışık: min..max arası tam dizi (rollback numarayı tüketmez).
      const min = numbers[0]!;
      const expected = numbers.map((_, i) => min + i);
      expect(numbers).toEqual(expected);
    } finally {
      await prisma.$disconnect();
    }
  }, 60_000);
});

describe('veresiye kredi limiti', () => {
  it('limit aşan veresiye (yetkisiz kullanıcı) → 400 CREDIT_LIMIT_EXCEEDED', async () => {
    // Düşük limitli cari.
    const contactRes = await request(server)
      .post('/contacts')
      .set(auth())
      .send({ type: 'CUSTOMER', name: 'Limitli Müşteri', creditLimit: '50.00' })
      .expect(201);
    const contactId = (contactRes.body as Envelope<{ id: string }>).data.id;

    // Kasiyer kullanıcı (SALE_CREDIT_OVER_LIMIT izni YOK).
    const roles = await request(server).get('/roles').set(auth()).expect(200);
    const cashierRole = (roles.body as Envelope<{ id: string; name: string }[]>).data.find(
      (r) => r.name === 'KASIYER',
    )!;
    const cashierEmail = `faz6-kasiyer-${randomUUID()}@stokk.test`;
    await request(server)
      .post('/users')
      .set(auth())
      .send({
        email: cashierEmail,
        password: 'KasiyerParola1',
        fullName: 'Kasiyer Kişi',
        roleIds: [cashierRole.id],
      })
      .expect(201);
    const login = await request(server)
      .post('/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email: cashierEmail, password: 'KasiyerParola1' })
      .expect(200);
    const cashierToken = (login.body as Envelope<{ accessToken: string }>).data.accessToken;

    const productId = await createProduct('Veresiye Ürün', '100.00', 20);
    const res = await request(server)
      .post('/sales')
      .set(auth(cashierToken))
      .send({
        cashSessionId: sessionId,
        contactId,
        lines: [{ productId, quantity: '1', unitPrice: '100.00', vatRate: 20 }],
        payments: [{ method: 'CREDIT', amount: '100.00' }],
      })
      .expect(400);
    expect((res.body as Envelope<never>).error?.code).toBe('CREDIT_LIMIT_EXCEEDED');

    // Patron (SALE_CREDIT_OVER_LIMIT var) aynı satışı yapabilir.
    const ok = await request(server)
      .post('/sales')
      .set(auth())
      .send({
        cashSessionId: sessionId,
        contactId,
        lines: [{ productId, quantity: '1', unitPrice: '100.00', vatRate: 20 }],
        payments: [{ method: 'CREDIT', amount: '100.00' }],
      })
      .expect(201);
    expect((ok.body as Envelope<{ status: string }>).data.status).toBe('COMPLETED');

    // Cari borç oluştu (biz alacaklıyız → balance +100).
    const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
    try {
      const c = await prisma.contact.findUniqueOrThrow({
        where: { id: contactId },
        select: { balance: true },
      });
      expect(Number(c.balance)).toBe(100);
    } finally {
      await prisma.$disconnect();
    }
  }, 30_000);

  it('veresiye satış kasada nakit hareketi oluşturmaz, yalnız cari borç yazılır', async () => {
    const contactRes = await request(server)
      .post('/contacts')
      .set(auth())
      .send({ type: 'CUSTOMER', name: 'Bol Limitli Müşteri', creditLimit: '1000.00' })
      .expect(201);
    const contactId = (contactRes.body as Envelope<{ id: string }>).data.id;

    const productId = await createProduct('Veresiye Kasa Etkisi Ürünü', '30.00', 20);
    const res = await request(server)
      .post('/sales')
      .set(auth())
      .send({
        cashSessionId: sessionId,
        contactId,
        lines: [{ productId, quantity: '1', unitPrice: '30.00', vatRate: 20 }],
        payments: [{ method: 'CREDIT', amount: '30.00' }],
      })
      .expect(201);
    const saleId = (res.body as Envelope<{ id: string }>).data.id;

    const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
    try {
      // Kasa etkisi yok: bu satışa bağlı hiçbir CashMovement yazılmamalı.
      const movementCount = await prisma.cashMovement.count({ where: { saleId } });
      expect(movementCount).toBe(0);

      const c = await prisma.contact.findUniqueOrThrow({
        where: { id: contactId },
        select: { balance: true },
      });
      expect(Number(c.balance)).toBe(30);
    } finally {
      await prisma.$disconnect();
    }
  });
});

describe('iptal ve iade', () => {
  it('satış iptali stok ve kasayı geri alır', async () => {
    const productId = await createProduct('İptal Ürünü', '10.00', 20);
    const sale = await request(server)
      .post('/sales')
      .set(auth())
      .send({
        cashSessionId: sessionId,
        lines: [{ productId, quantity: '5', unitPrice: '10.00', vatRate: 20 }],
        payments: [{ method: 'CASH', amount: '50.00' }],
      })
      .expect(201);
    const saleId = (sale.body as Envelope<{ id: string }>).data.id;
    expect(await stockOf(productId)).toBe(995);

    await request(server).post(`/sales/${saleId}/cancel`).set(auth()).expect(204);
    expect(await stockOf(productId)).toBe(1000); // stok geri döndü

    const detail = await request(server).get(`/sales/${saleId}`).set(auth()).expect(200);
    expect((detail.body as Envelope<{ status: string }>).data.status).toBe('CANCELLED');
  });

  it('kalem bazlı iade: stok geri, satış PARTIALLY_RETURNED', async () => {
    const productId = await createProduct('İade Ürünü', '20.00', 20);
    const sale = await request(server)
      .post('/sales')
      .set(auth())
      .send({
        cashSessionId: sessionId,
        lines: [{ productId, quantity: '4', unitPrice: '20.00', vatRate: 20 }],
        payments: [{ method: 'CASH', amount: '80.00' }],
      })
      .expect(201);
    const saleData = (sale.body as Envelope<{ id: string; items: { id: string }[] }>).data;
    expect(await stockOf(productId)).toBe(996);

    const ret = await request(server)
      .post(`/sales/${saleData.id}/returns`)
      .set(auth())
      .send({
        refundMethod: 'CASH',
        reason: 'Müşteri iadesi',
        items: [{ saleItemId: saleData.items[0]!.id, quantity: '1' }],
      })
      .expect(201);
    expect(Number((ret.body as Envelope<{ totalAmount: string }>).data.totalAmount)).toBe(20);
    expect(await stockOf(productId)).toBe(997); // 1 adet geri döndü

    const detail = await request(server).get(`/sales/${saleData.id}`).set(auth()).expect(200);
    expect((detail.body as Envelope<{ status: string }>).data.status).toBe('PARTIALLY_RETURNED');
  });

  it('tüm kalemler iade edilince satış RETURNED olur, kasadan tam tutar çıkar', async () => {
    const productId = await createProduct('Tam İade Ürünü', '25.00', 20);
    const sale = await request(server)
      .post('/sales')
      .set(auth())
      .send({
        cashSessionId: sessionId,
        lines: [{ productId, quantity: '3', unitPrice: '25.00', vatRate: 20 }],
        payments: [{ method: 'CASH', amount: '75.00' }],
      })
      .expect(201);
    const saleData = (sale.body as Envelope<{ id: string; items: { id: string }[] }>).data;

    const ret = await request(server)
      .post(`/sales/${saleData.id}/returns`)
      .set(auth())
      .send({
        refundMethod: 'CASH',
        reason: 'Tam iade — müşteri vazgeçti',
        items: [{ saleItemId: saleData.items[0]!.id, quantity: '3' }],
      })
      .expect(201);
    expect(Number((ret.body as Envelope<{ totalAmount: string }>).data.totalAmount)).toBe(75);
    expect(await stockOf(productId)).toBe(1000); // 3 adedin tamamı geri döndü

    const detail = await request(server).get(`/sales/${saleData.id}`).set(auth()).expect(200);
    expect((detail.body as Envelope<{ status: string }>).data.status).toBe('RETURNED');

    // Nakit iade tam tutarda kasadan çıkmış (negatif SALE_REFUND hareketi).
    const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
    try {
      const refund = await prisma.cashMovement.findFirst({
        where: { saleId: saleData.id, type: 'SALE_REFUND' },
        select: { amount: true },
      });
      expect(Number(refund?.amount)).toBe(-75);
    } finally {
      await prisma.$disconnect();
    }
  });
});

describe('park / geri alma ve sync', () => {
  it('park edilen satış tamamlanınca stok düşer ve fiş no alır', async () => {
    const productId = await createProduct('Park Ürünü', '10.00', 20);
    const parked = await request(server)
      .post('/sales/park')
      .set(auth())
      .send({
        cashSessionId: sessionId,
        lines: [{ productId, quantity: '2', unitPrice: '10.00', vatRate: 20 }],
      })
      .expect(201);
    const parkedData = (parked.body as Envelope<{ id: string; status: string }>).data;
    expect(parkedData.status).toBe('PARKED');
    expect(await stockOf(productId)).toBe(1000); // park stok düşürmez

    const done = await request(server)
      .post(`/sales/${parkedData.id}/complete`)
      .set(auth())
      .send({ payments: [{ method: 'CASH', amount: '20.00' }] })
      .expect(201);
    const doneData = (done.body as Envelope<{ status: string; receiptNo: string }>).data;
    expect(doneData.status).toBe('COMPLETED');
    expect(doneData.receiptNo).not.toContain('PARK-');
    expect(await stockOf(productId)).toBe(998);
  });

  it('sync/sales toplu idempotent: tekrar gönderim yeni satış açmaz', async () => {
    const productId = await createProduct('Sync Ürünü', '10.00', 20);
    const clientSaleId = randomUUID();
    const payload = {
      sales: [
        {
          cashSessionId: sessionId,
          clientSaleId,
          lines: [{ productId, quantity: '1', unitPrice: '10.00', vatRate: 20 }],
          payments: [{ method: 'CASH', amount: '10.00' }],
        },
      ],
    };
    const first = await request(server).post('/sync/sales').set(auth()).send(payload).expect(201);
    expect(
      (first.body as Envelope<{ results: { status: string }[] }>).data.results[0]!.status,
    ).toBe('created');
    const second = await request(server).post('/sync/sales').set(auth()).send(payload).expect(201);
    expect(
      (second.body as Envelope<{ results: { status: string }[] }>).data.results[0]!.status,
    ).toBe('duplicate');
    expect(await stockOf(productId)).toBe(999); // tek düşüm

    // pull katalog döndürür.
    const pull = await request(server).get('/sync/pull').set(auth()).expect(200);
    expect(Array.isArray((pull.body as Envelope<{ products: unknown[] }>).data.products)).toBe(
      true,
    );
  });
});

describe('vardiya kapanış — beklenen/fark hesabı', () => {
  it('beklenen = açılış + nakit satış - çekilen; fark eşiği aşınca overThreshold true', async () => {
    // Ana vardiya (sessionId) diğer testler boyunca açık kalmalı; ayrı kasa+vardiya açıyoruz.
    const registerRes = await request(server)
      .post('/registers')
      .set(auth())
      .send({ name: 'FAZ6 Vardiya Kasası' })
      .expect(201);
    const closeRegisterId = (registerRes.body as Envelope<{ id: string }>).data.id;

    const openRes = await request(server)
      .post('/cash-sessions')
      .set(auth())
      .send({ registerId: closeRegisterId, openingAmount: '200.00' })
      .expect(201);
    const closeSessionId = (openRes.body as Envelope<{ id: string }>).data.id;

    const productId = await createProduct('Vardiya Kapanış Ürünü', '15.00', 20);
    await request(server)
      .post('/sales')
      .set(auth())
      .send({
        cashSessionId: closeSessionId,
        lines: [{ productId, quantity: '2', unitPrice: '15.00', vatRate: 20 }],
        payments: [{ method: 'CASH', amount: '30.00', receivedAmount: '30.00' }],
      })
      .expect(201);

    await request(server)
      .post(`/cash-sessions/${closeSessionId}/movements`)
      .set(auth())
      .send({ type: 'WITHDRAWAL', amount: '10.00', description: 'FAZ6 gider ödemesi' })
      .expect(201);

    // Beklenen = 200 (açılış) + 30 (nakit satış) - 10 (çekilen) = 220.
    // Sayılan (closingAmount) kasiyer eliyle 200 girildi → fark = -20 (eksik), eşik (5.00) aşılıyor.
    const closeRes = await request(server)
      .post(`/cash-sessions/${closeSessionId}/close`)
      .set(auth())
      .send({ closingAmount: '200.00' })
      .expect(201);
    const closeData = (
      closeRes.body as Envelope<{
        overThreshold: boolean;
        session: {
          status: string;
          expectedAmount: string;
          closingAmount: string;
          differenceAmount: string;
        };
      }>
    ).data;
    expect(closeData.session.status).toBe('CLOSED');
    expect(Number(closeData.session.expectedAmount)).toBe(220);
    expect(Number(closeData.session.closingAmount)).toBe(200);
    expect(Number(closeData.session.differenceAmount)).toBe(-20);
    expect(closeData.overThreshold).toBe(true);

    // Kapalı vardiyayı ikinci kez kapatmak çakışma hatası verir (çift kapama önleme).
    const secondClose = await request(server)
      .post(`/cash-sessions/${closeSessionId}/close`)
      .set(auth())
      .send({ closingAmount: '200.00' })
      .expect(409);
    expect((secondClose.body as Envelope<never>).error?.code).toBe('CONFLICT');
  });
});

describe('ajan bulguları — regresyon testleri (Faz 6)', () => {
  it('eşzamanlı aynı clientSaleId: tek satış, idempotent (409/hata değil)', async () => {
    const productId = await createProduct('Race Ürünü', '10.00', 20);
    const clientSaleId = randomUUID();
    const body = {
      cashSessionId: sessionId,
      clientSaleId,
      lines: [{ productId, quantity: '2', unitPrice: '10.00', vatRate: 20 }],
      payments: [{ method: 'CASH', amount: '20.00' }],
    };
    // İki isteği gerçekten paralel gönder.
    const [a, b] = await Promise.all([
      request(server).post('/sales').set(auth()).send(body),
      request(server).post('/sales').set(auth()).send(body),
    ]);
    // İkisi de 201 ve AYNI satış — kaybeden P2002'yi idempotent kabul edip mevcut satışı döner.
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const idA = (a.body as Envelope<{ id: string }>).data.id;
    const idB = (b.body as Envelope<{ id: string }>).data.id;
    expect(idA).toBe(idB);

    const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
    try {
      expect(await prisma.sale.count({ where: { clientSaleId } })).toBe(1);
      expect(await prisma.stockMovement.count({ where: { productId, type: 'SALE' } })).toBe(1);
    } finally {
      await prisma.$disconnect();
    }
    expect(await stockOf(productId)).toBe(998); // tek düşüm
  });

  it('yüksek indirim park→tamamla ile atlanamaz (kasiyer 403)', async () => {
    const cashierToken = await createCashierToken();
    const productId = await createProduct('Park İndirim Ürünü', '100.00', 20);
    // Doğrudan satışta yüksek indirim (eşik %10) → 403.
    await request(server)
      .post('/sales')
      .set(auth(cashierToken))
      .send({
        cashSessionId: sessionId,
        lines: [{ productId, quantity: '1', unitPrice: '100.00', vatRate: 20, discountRate: '90' }],
        payments: [{ method: 'CASH', amount: '10.00' }],
      })
      .expect(403);
    // Park yoluyla da engellenir (bypass kapalı).
    await request(server)
      .post('/sales/park')
      .set(auth(cashierToken))
      .send({
        cashSessionId: sessionId,
        lines: [{ productId, quantity: '1', unitPrice: '100.00', vatRate: 20, discountRate: '90' }],
      })
      .expect(403);
  });

  it('creditLimit=0 = sıfır limit: veresiye kasiyer için reddedilir', async () => {
    const cashierToken = await createCashierToken();
    // Limit belirtilmemiş cari → creditLimit 0 (schema: "0 = sıfır limit").
    const contact = await request(server)
      .post('/contacts')
      .set(auth())
      .send({ type: 'CUSTOMER', name: 'Limitsiz Sıfır Cari' })
      .expect(201);
    const contactId = (contact.body as Envelope<{ id: string }>).data.id;
    const productId = await createProduct('Sıfır Limit Ürünü', '10.00', 20);

    await request(server)
      .post('/sales')
      .set(auth(cashierToken))
      .send({
        cashSessionId: sessionId,
        contactId,
        lines: [{ productId, quantity: '1', unitPrice: '10.00', vatRate: 20 }],
        payments: [{ method: 'CREDIT', amount: '10.00' }],
      })
      .expect(400);
  });

  it('veresiye satış iptali cari borcu geri alır', async () => {
    // Patron (SALE_CREDIT_OVER_LIMIT) → limit engeli yok.
    const contact = await request(server)
      .post('/contacts')
      .set(auth())
      .send({ type: 'CUSTOMER', name: 'İptal Veresiye Cari', creditLimit: '1000.00' })
      .expect(201);
    const contactId = (contact.body as Envelope<{ id: string }>).data.id;
    const productId = await createProduct('İptal Veresiye Ürünü', '50.00', 20);

    const sale = await request(server)
      .post('/sales')
      .set(auth())
      .send({
        cashSessionId: sessionId,
        contactId,
        lines: [{ productId, quantity: '2', unitPrice: '50.00', vatRate: 20 }],
        payments: [{ method: 'CREDIT', amount: '100.00' }],
      })
      .expect(201);
    const saleId = (sale.body as Envelope<{ id: string }>).data.id;
    expect(await contactBalance(contactId)).toBe(100); // borç oluştu

    await request(server).post(`/sales/${saleId}/cancel`).set(auth()).expect(204);
    expect(await contactBalance(contactId)).toBe(0); // borç geri alındı
  });

  it('kapalı vardiyada satış iptali reddedilir (iade kullanılır)', async () => {
    // Ayrı kasa + vardiya (paylaşılan sessionId'yi bozmadan).
    const register = await request(server)
      .post('/registers')
      .set(auth())
      .send({ name: `Kasa İptal ${randomUUID().slice(0, 8)}` })
      .expect(201);
    const rid = (register.body as Envelope<{ id: string }>).data.id;
    const open = await request(server)
      .post('/cash-sessions')
      .set(auth())
      .send({ registerId: rid, openingAmount: '0.00' })
      .expect(201);
    const sid = (open.body as Envelope<{ id: string }>).data.id;

    const productId = await createProduct('Kapalı Vardiya Ürünü', '10.00', 20);
    const sale = await request(server)
      .post('/sales')
      .set(auth())
      .send({
        cashSessionId: sid,
        lines: [{ productId, quantity: '1', unitPrice: '10.00', vatRate: 20 }],
        payments: [{ method: 'CASH', amount: '10.00' }],
      })
      .expect(201);
    const saleId = (sale.body as Envelope<{ id: string }>).data.id;

    await request(server)
      .post(`/cash-sessions/${sid}/close`)
      .set(auth())
      .send({ closingAmount: '10.00' })
      .expect(201);

    const res = await request(server).post(`/sales/${saleId}/cancel`).set(auth()).expect(400);
    expect((res.body as Envelope<never>).error?.code).toBe('SESSION_CLOSED');
  });

  it('satılandan fazla iade reddedilir', async () => {
    const productId = await createProduct('Aşırı İade Ürünü', '10.00', 20);
    const sale = await request(server)
      .post('/sales')
      .set(auth())
      .send({
        cashSessionId: sessionId,
        lines: [{ productId, quantity: '2', unitPrice: '10.00', vatRate: 20 }],
        payments: [{ method: 'CASH', amount: '20.00' }],
      })
      .expect(201);
    const saleData = (sale.body as Envelope<{ id: string; items: { id: string }[] }>).data;

    const res = await request(server)
      .post(`/sales/${saleData.id}/returns`)
      .set(auth())
      .send({
        refundMethod: 'CASH',
        reason: 'Fazla iade denemesi',
        items: [{ saleItemId: saleData.items[0]!.id, quantity: '3' }],
      })
      .expect(400);
    expect((res.body as Envelope<never>).error?.code).toBe('RETURN_EXCEEDS_SOLD');
  });
});
