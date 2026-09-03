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
 * Faz 10 doğrulama maddesi: "tahsilat sonrası bakiye, ekstre ve yaşlandırma
 * birbiriyle tutarlı". `products-gap.e2e.spec.ts` ile aynı desen: gerçek
 * Postgres/Redis, X-Forwarded-For ile IP izolasyonu, "FAZ10-GAP " ön ekli
 * tenant adı + afterAll temizliği.
 *
 * Borç yaratma yöntemi: gerçek bir alış faturası (POST /purchases) tedarikçiye
 * borç yaratır (balance NEGATİFE gider — "biz borçlanırız"), yaşlandırma ise
 * balance > 0 olan alacaklar için anlamlıdır. Bu yüzden burada `POST
 * /contacts/payments` + `direction: 'pay'` ile MÜŞTERİ carisine doğrudan bir
 * DEBIT hareketi yazılıyor: `applyTransaction` seviyesinde bunun defter etkisi
 * (DEBIT → +balance) veresiye bir satışın üreteceği hareketle birebir aynıdır,
 * ama ürün/stok/vardiya/POS-core akışını kurmadan (bu dosyanın kapsamı dışı)
 * tek bir istekle tekrarlanabilir bir borç üretir.
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

interface ContactDetail {
  id: string;
  balance: string;
}

interface StatementMovement {
  id: string;
  type: 'DEBIT' | 'CREDIT';
  amount: string;
  balanceAfter: string;
}

interface Statement {
  contact: { id: string; name: string; balance: string };
  opening: string;
  closing: string;
  movements: StatementMovement[];
}

interface Aging {
  current: string;
  days31to60: string;
  days61to90: string;
  over90: string;
  total: string;
}

let app: INestApplication & NestExpressApplication;
let server: Server;

let ipCounter = 0;
const nextIp = (): string => `10.85.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

// Tüm zamanı kapsayan sabit aralık — ekstre testlerinde `purchase.e2e.spec.ts` ile aynı desen.
const FROM = '2000-01-01T00:00:00.000Z';
const TO = '2100-01-01T00:00:00.000Z';

async function registerTenant(businessName: string): Promise<AuthPayload> {
  const res = await request(server)
    .post('/auth/register')
    .set('X-Forwarded-For', nextIp())
    .send({
      businessName,
      fullName: 'Test Patron',
      email: `faz10-gap-${randomUUID()}@stokk.test`,
      password: 'CokGizliParola1',
    })
    .expect(201);
  return (res.body as Envelope<AuthPayload>).data;
}

const authHeader = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'X-Forwarded-For': nextIp(),
});

async function createCustomer(token: string, name: string): Promise<string> {
  const res = await request(server)
    .post('/contacts')
    .set(authHeader(token))
    .send({ type: 'CUSTOMER', name })
    .expect(201);
  return (res.body as Envelope<{ id: string }>).data.id;
}

/** DEBIT hareketi: cari bize borçlanır (balance artar). Bkz. dosya başındaki not. */
async function createDebt(token: string, contactId: string, amount: string): Promise<void> {
  await request(server)
    .post('/contacts/payments')
    .set(authHeader(token))
    .send({ contactId, direction: 'pay', amount, method: 'CASH' })
    .expect(201);
}

/** CREDIT hareketi: müşteriden tahsilat (balance düşer). */
async function collect(token: string, contactId: string, amount: string): Promise<void> {
  await request(server)
    .post('/contacts/payments')
    .set(authHeader(token))
    .send({ contactId, direction: 'collect', amount, method: 'CASH' })
    .expect(201);
}

async function getContact(token: string, contactId: string): Promise<ContactDetail> {
  const res = await request(server)
    .get(`/contacts/${contactId}`)
    .set(authHeader(token))
    .expect(200);
  return (res.body as Envelope<ContactDetail>).data;
}

async function getStatement(token: string, contactId: string): Promise<Statement> {
  const res = await request(server)
    .get(`/contacts/${contactId}/statement`)
    .query({ from: FROM, to: TO })
    .set(authHeader(token))
    .expect(200);
  return (res.body as Envelope<Statement>).data;
}

async function getAging(token: string, contactId: string): Promise<Aging> {
  const res = await request(server)
    .get(`/contacts/${contactId}/aging`)
    .set(authHeader(token))
    .expect(200);
  return (res.body as Envelope<Aging>).data;
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
  await prisma.tenant.deleteMany({ where: { name: { startsWith: 'FAZ10-GAP ' } } });
  await prisma.$disconnect();
  await app.close();
});

describe('kısmi tahsilat — bakiye / ekstre / yaşlandırma tutarlılığı', () => {
  it('1000 borç + 400 tahsilat sonrası üçü de 600.00 gösterir', async () => {
    const tenant = await registerTenant('FAZ10-GAP Kismi');
    const contactId = await createCustomer(tenant.accessToken, 'Kısmi Tahsilat Müşterisi');

    await createDebt(tenant.accessToken, contactId, '1000.00');
    await collect(tenant.accessToken, contactId, '400.00');

    const contact = await getContact(tenant.accessToken, contactId);
    // GET /contacts/:id ham Decimal döner (toFixed uygulanmaz) — Number ile karşılaştır.
    expect(Number(contact.balance)).toBe(600);

    const statement = await getStatement(tenant.accessToken, contactId);
    expect(statement.opening).toBe('0.00');
    expect(statement.closing).toBe('600.00');
    expect(statement.contact.balance).toBe('600.00');

    const lastMovement = statement.movements.at(-1);
    expect(lastMovement).toBeDefined();
    expect(Number(lastMovement?.balanceAfter)).toBe(600);

    // Ekstredeki hareketlerin işaretli toplamı (DEBIT +, CREDIT −) = closing - opening.
    const signedSum = statement.movements.reduce((sum, m) => {
      const signed = m.type === 'DEBIT' ? Number(m.amount) : -Number(m.amount);
      return sum + signed;
    }, 0);
    expect(signedSum).toBe(Number(statement.closing) - Number(statement.opening));

    const aging = await getAging(tenant.accessToken, contactId);
    expect(aging.total).toBe('600.00');
    expect(Number(aging.total)).toBe(Number(contact.balance));
  });
});

describe('tam tahsilat — bakiye ve yaşlandırma sıfırlanır', () => {
  it('1000 borç + 1000 tahsilat sonrası bakiye/ekstre/yaşlandırma 0.00', async () => {
    const tenant = await registerTenant('FAZ10-GAP Tam');
    const contactId = await createCustomer(tenant.accessToken, 'Tam Tahsilat Müşterisi');

    await createDebt(tenant.accessToken, contactId, '1000.00');
    await collect(tenant.accessToken, contactId, '1000.00');

    const contact = await getContact(tenant.accessToken, contactId);
    expect(Number(contact.balance)).toBe(0);

    const statement = await getStatement(tenant.accessToken, contactId);
    expect(statement.closing).toBe('0.00');

    const aging = await getAging(tenant.accessToken, contactId);
    expect(aging.total).toBe('0.00');
  });
});

describe('fazla tahsilat — bakiye negatife döner, açık borç kalmaz', () => {
  it('1000 borç + 1500 tahsilat sonrası bakiye -500.00, yaşlandırma toplamı 0.00', async () => {
    const tenant = await registerTenant('FAZ10-GAP Fazla');
    const contactId = await createCustomer(tenant.accessToken, 'Fazla Tahsilat Müşterisi');

    await createDebt(tenant.accessToken, contactId, '1000.00');
    await collect(tenant.accessToken, contactId, '1500.00');

    const contact = await getContact(tenant.accessToken, contactId);
    // Borçtan fazla tahsilat → biz borçlanırız, bakiye negatife döner.
    expect(Number(contact.balance)).toBe(-500);

    const statement = await getStatement(tenant.accessToken, contactId);
    expect(statement.closing).toBe('-500.00');
    expect(Number(statement.closing)).toBe(Number(contact.balance));

    // Yaşlandırma yalnız AÇIK borçları (DEBIT'leri) kovalar; fazla tahsilat sonrası
    // açık borç kalmadığından toplam 0.00'dır — fazla ödeme "carry" olarak ileride
    // gelecek bir DEBIT'i kapatmak üzere taşınır, ancak negatif bir kovada görünmez
    // (bkz. contact-ledger.service.ts `bucketAging`).
    const aging = await getAging(tenant.accessToken, contactId);
    expect(aging.total).toBe('0.00');
  });
});
