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

interface AuthPayload {
  accessToken: string;
  refreshToken: string;
  user: { id: string; tenantId: string; email: string; permissions: string[] };
}

let app: INestApplication & NestExpressApplication;
let server: Server;

/** Her koşuda benzersiz e-posta — testler birbirini ve dev verisini bozmasın. */
const unique = (): string => `test-${randomUUID()}@stokk.test`;

/** Her çağrı ayrı bir istemci IP'si — rate limit testler arasında taşmasın. */
let ipCounter = 0;
const nextIp = (): string => `10.99.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

async function registerTenant(businessName: string): Promise<AuthPayload> {
  const response = await request(server)
    .post('/auth/register')
    .set('X-Forwarded-For', nextIp())
    .send({ businessName, fullName: 'Test Patron', email: unique(), password: 'CokGizliParola1' })
    .expect(201);

  return (response.body as Envelope<AuthPayload>).data;
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  // Rate limit gerçek kalsın ama testler birbirini kesmesin: trust proxy açık,
  // her test kendi X-Forwarded-For IP'sini veriyor.
  app.set('trust proxy', true);
  await app.init();
  server = app.getHttpServer() as Server;
}, 60_000);

afterAll(async () => {
  // Testin ürettiği tenant'ları temizle — sahip istemcisi RLS'i baypas eder.
  const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
  await prisma.tenant.deleteMany({ where: { name: { startsWith: 'E2E ' } } });
  await prisma.$disconnect();
  await app.close();
});

describe('kayıt → giriş → me zinciri', () => {
  it('kayıt tenant, sistem rolleri ve Patron kullanıcıyı oluşturur', async () => {
    const auth = await registerTenant('E2E Market');

    expect(auth.accessToken).toBeTruthy();
    expect(auth.refreshToken).toBeTruthy();
    expect(auth.user.tenantId).toBeTruthy();
    // Patron tüm izinlere sahip olmalı.
    expect(auth.user.permissions.length).toBeGreaterThan(40);
  });

  it('giriş yapıp /auth/me ile kendi bilgisini okur', async () => {
    const email = unique();
    await request(server)
      .post('/auth/register')
      .send({ businessName: 'E2E Giriş', fullName: 'Patron', email, password: 'CokGizliParola1' })
      .expect(201);

    const login = await request(server)
      .post('/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email, password: 'CokGizliParola1' })
      .expect(200);

    const auth = (login.body as Envelope<AuthPayload>).data;

    const me = await request(server)
      .get('/auth/me')
      .set('X-Forwarded-For', nextIp())
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .expect(200);

    expect((me.body as Envelope<AuthPayload['user']>).data.email).toBe(email);
  });

  it('token olmadan /auth/me 401 döner ve zarf hatalıdır', async () => {
    const response = await request(server).get('/auth/me').expect(401);
    const body = response.body as Envelope<never>;

    expect(body.ok).toBe(false);
    expect(body.error?.code).toBe('UNAUTHENTICATED');
  });

  it('hatalı şifre 401, e-postanın kayıtlı olup olmadığını sızdırmaz', async () => {
    const email = unique();
    await request(server)
      .post('/auth/register')
      .send({ businessName: 'E2E Şifre', fullName: 'Patron', email, password: 'CokGizliParola1' })
      .expect(201);

    const wrongPassword = await request(server)
      .post('/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email, password: 'YanlisParola1' })
      .expect(401);

    const unknownEmail = await request(server)
      .post('/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email: unique(), password: 'YanlisParola1' })
      .expect(401);

    expect((wrongPassword.body as Envelope<never>).error?.message).toBe(
      (unknownEmail.body as Envelope<never>).error?.message,
    );
  });
});

describe('tenant izolasyonu', () => {
  it('başka tenant’ın kullanıcısına erişim 404 döner (403 veya 200 değil)', async () => {
    const tenantA = await registerTenant('E2E Tenant A');
    const tenantB = await registerTenant('E2E Tenant B');

    const response = await request(server)
      .get(`/users/${tenantB.user.id}`)
      .set('X-Forwarded-For', nextIp())
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .expect(404);

    expect((response.body as Envelope<never>).error?.code).toBe('NOT_FOUND');
  });

  it('kullanıcı listesi yalnız kendi tenant’ını gösterir', async () => {
    const tenantA = await registerTenant('E2E Liste A');
    await registerTenant('E2E Liste B');

    const response = await request(server)
      .get('/users')
      .set('X-Forwarded-For', nextIp())
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .expect(200);

    const users = (response.body as Envelope<{ id: string }[]>).data;
    expect(users).toHaveLength(1);
    expect(users[0]?.id).toBe(tenantA.user.id);
  });

  it('roller de tenant sınırında kalır', async () => {
    const tenantA = await registerTenant('E2E Rol A');
    await registerTenant('E2E Rol B');

    const response = await request(server)
      .get('/roles')
      .set('X-Forwarded-For', nextIp())
      .set('Authorization', `Bearer ${tenantA.accessToken}`)
      .expect(200);

    // Yalnız kendi 3 sistem rolü — iki tenant'ın 6 rolü değil.
    expect((response.body as Envelope<unknown[]>).data).toHaveLength(3);
  });
});

describe('refresh rotasyonu', () => {
  it('eski refresh token ikinci kez kullanılamaz', async () => {
    const auth = await registerTenant('E2E Rotasyon');

    const first = await request(server)
      .post('/auth/refresh')
      .set('X-Forwarded-For', nextIp())
      .send({ refreshToken: auth.refreshToken })
      .expect(200);

    const rotated = (first.body as Envelope<AuthPayload>).data;
    expect(rotated.refreshToken).not.toBe(auth.refreshToken);

    // Aynı token tekrar gönderiliyor — geçersiz olmalı.
    const reuse = await request(server)
      .post('/auth/refresh')
      .set('X-Forwarded-For', nextIp())
      .send({ refreshToken: auth.refreshToken })
      .expect(401);

    expect((reuse.body as Envelope<never>).error?.code).toBe('UNAUTHENTICATED');

    // Yeni token hâlâ geçerli.
    await request(server)
      .post('/auth/refresh')
      .set('X-Forwarded-For', nextIp())
      .send({ refreshToken: rotated.refreshToken })
      .expect(200);
  });

  it('logout sonrası refresh çalışmaz', async () => {
    const auth = await registerTenant('E2E Çıkış');

    await request(server)
      .post('/auth/logout')
      .send({ refreshToken: auth.refreshToken })
      .expect(204);

    await request(server)
      .post('/auth/refresh')
      .set('X-Forwarded-For', nextIp())
      .send({ refreshToken: auth.refreshToken })
      .expect(401);
  });
});

describe('validation', () => {
  it('şemada olmayan alan reddedilir (strict parse)', async () => {
    const response = await request(server)
      .post('/auth/register')
      .send({
        businessName: 'E2E Strict',
        fullName: 'Patron',
        email: unique(),
        password: 'CokGizliParola1',
        isAdmin: true,
      })
      .expect(400);

    expect((response.body as Envelope<never>).error?.code).toBe('VALIDATION_FAILED');
  });

  it('kısa şifre reddedilir', async () => {
    await request(server)
      .post('/auth/register')
      .send({ businessName: 'E2E Kısa', fullName: 'Patron', email: unique(), password: 'kisa' })
      .expect(400);
  });
});

describe('rate limit', () => {
  it('aynı IP’den 6. giriş denemesi 429 döner', async () => {
    const email = unique();
    await request(server)
      .post('/auth/register')
      .set('X-Forwarded-For', nextIp())
      .send({ businessName: 'E2E Limit', fullName: 'Patron', email, password: 'CokGizliParola1' })
      .expect(201);

    // Auth endpoint'lerinde limit 5/dk/IP — 03-mimari.md "Güvenlik".
    const attackerIp = '10.200.0.1';
    const statuses: number[] = [];

    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const response = await request(server)
        .post('/auth/login')
        .set('X-Forwarded-For', attackerIp)
        .send({ email, password: 'YanlisParola1' });
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 5).every((status) => status === 401)).toBe(true);
    expect(statuses[5]).toBe(429);
  });
});

describe('izin kontrolü', () => {
  it('kasiyer kullanıcı yönetimine erişemez, Patron erişebilir', async () => {
    const owner = await registerTenant('E2E Yetki');

    const roles = await request(server)
      .get('/roles')
      .set('X-Forwarded-For', nextIp())
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    const cashierRole = (roles.body as Envelope<{ id: string; name: string }[]>).data.find(
      (role) => role.name === 'KASIYER',
    );
    expect(cashierRole).toBeDefined();

    const cashierEmail = unique();
    await request(server)
      .post('/users')
      .set('X-Forwarded-For', nextIp())
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        email: cashierEmail,
        password: 'CokGizliParola1',
        fullName: 'Kasiyer',
        roleIds: [cashierRole?.id],
      })
      .expect(201);

    const cashierLogin = await request(server)
      .post('/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email: cashierEmail, password: 'CokGizliParola1' })
      .expect(200);

    const cashier = (cashierLogin.body as Envelope<AuthPayload>).data;
    expect(cashier.user.permissions).not.toContain('user.manage');

    // Kasiyer kullanıcı listeleyemez: user.view izni yok.
    const forbidden = await request(server)
      .get('/users')
      .set('X-Forwarded-For', nextIp())
      .set('Authorization', `Bearer ${cashier.accessToken}`)
      .expect(403);

    expect((forbidden.body as Envelope<never>).error?.code).toBe('FORBIDDEN');

    // Patron erişebiliyor.
    await request(server)
      .get('/users')
      .set('X-Forwarded-For', nextIp())
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);
  });
});

describe('güvenlik denetimi düzeltmeleri', () => {
  it('pasifleştirilen kullanıcı refresh ile erişimini sürdüremez (F1)', async () => {
    const owner = await registerTenant('E2E F1');

    // Patron'un yönetebileceği bir kasiyer oluştur.
    const roles = await request(server)
      .get('/roles')
      .set('X-Forwarded-For', nextIp())
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);
    const cashierRole = (roles.body as Envelope<{ id: string; name: string }[]>).data.find(
      (r) => r.name === 'KASIYER',
    );

    const cashierEmail = unique();
    const created = await request(server)
      .post('/users')
      .set('X-Forwarded-For', nextIp())
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        email: cashierEmail,
        password: 'CokGizliParola1',
        fullName: 'Kasiyer',
        roleIds: [cashierRole?.id],
      })
      .expect(201);
    const cashierId = (created.body as Envelope<{ id: string }>).data.id;

    const login = await request(server)
      .post('/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email: cashierEmail, password: 'CokGizliParola1' })
      .expect(200);
    const cashier = (login.body as Envelope<AuthPayload>).data;

    // Patron kasiyeri pasifleştiriyor.
    await request(server)
      .delete(`/users/${cashierId}`)
      .set('X-Forwarded-For', nextIp())
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(204);

    // Kasiyerin refresh token'ı artık çalışmamalı.
    await request(server)
      .post('/auth/refresh')
      .set('X-Forwarded-For', nextIp())
      .send({ refreshToken: cashier.refreshToken })
      .expect(401);
  });

  it('user.manage sahibi kendini yükseltemez ve PATRON rolü atayamaz (F3)', async () => {
    const owner = await registerTenant('E2E F3');

    const roles = await request(server)
      .get('/roles')
      .set('X-Forwarded-For', nextIp())
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);
    const roleList = (roles.body as Envelope<{ id: string; name: string }[]>).data;
    const patronRoleId = roleList.find((r) => r.name === 'PATRON')?.id;
    const cashierRoleId = roleList.find((r) => r.name === 'KASIYER')?.id;

    // Yalnız user yönetimi olan özel rol.
    const office = await request(server)
      .post('/roles')
      .set('X-Forwarded-For', nextIp())
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Ofis', permissions: ['user.view', 'user.manage'] })
      .expect(201);
    const officeRoleId = (office.body as Envelope<{ id: string }>).data.id;

    const clerkEmail = unique();
    const clerk = await request(server)
      .post('/users')
      .set('X-Forwarded-For', nextIp())
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        email: clerkEmail,
        password: 'CokGizliParola1',
        fullName: 'Clerk',
        roleIds: [officeRoleId],
      })
      .expect(201);
    const clerkId = (clerk.body as Envelope<{ id: string }>).data.id;

    const clerkLogin = await request(server)
      .post('/auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email: clerkEmail, password: 'CokGizliParola1' })
      .expect(200);
    const clerkToken = (clerkLogin.body as Envelope<AuthPayload>).data.accessToken;

    // (a) Yeni kullanıcıya PATRON rolü atamayı dene → 403 (yetki yükseltme).
    await request(server)
      .post('/users')
      .set('X-Forwarded-For', nextIp())
      .set('Authorization', `Bearer ${clerkToken}`)
      .send({
        email: unique(),
        password: 'CokGizliParola1',
        fullName: 'Kullanici X',
        roleIds: [patronRoleId],
      })
      .expect(403);

    // (b) Kendi rollerini değiştirmeyi dene → 403.
    await request(server)
      .patch(`/users/${clerkId}`)
      .set('X-Forwarded-For', nextIp())
      .set('Authorization', `Bearer ${clerkToken}`)
      .send({ roleIds: [patronRoleId] })
      .expect(403);

    // (c) Sahip olduğu izinlerin alt kümesini içeren rolü atayabilmeli → 201.
    await request(server)
      .post('/users')
      .set('X-Forwarded-For', nextIp())
      .set('Authorization', `Bearer ${clerkToken}`)
      .send({
        email: unique(),
        password: 'CokGizliParola1',
        fullName: 'Kullanici Y',
        roleIds: [officeRoleId],
      })
      .expect(201);

    // KASIYER rolü sale.create içeriyor, clerk'te yok → 403.
    await request(server)
      .post('/users')
      .set('X-Forwarded-For', nextIp())
      .set('Authorization', `Bearer ${clerkToken}`)
      .send({
        email: unique(),
        password: 'CokGizliParola1',
        fullName: 'Kullanici Z',
        roleIds: [cashierRoleId],
      })
      .expect(403);
  });
});
