import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPrismaClient } from '@stokk/db';
import { PERMISSIONS, SYSTEM_ROLES } from '@stokk/types';

import { AppModule } from '../src/app.module.js';

/**
 * Faz 11 doğrulama maddeleri:
 *  1. "kasiyer hesabıyla giriş → kâr raporu menüde yok, doğrudan URL ile de 403"
 *  2. "ayarlarda kimlik bilgisi maskeli, kaydedince yeniden yazılmadıkça değişmiyor"
 *
 * Ayrıca Faz 11 ajan bulgularının regresyonları: iade tutarının indirimi dikkate
 * alması ve son yetkilinin kendini kilitleyememesi.
 *
 * `products-gap.e2e.spec.ts` deseni: gerçek Postgres/Redis, X-Forwarded-For ile IP
 * izolasyonu, "FAZ11-GAP " ön ekli tenant + afterAll temizliği.
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
const nextIp = (): string => `10.99.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

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
      email: `faz11-${randomUUID()}@stokk.test`,
      password: 'CokGizliParola1',
    })
    .expect(201);
  return (res.body as Envelope<AuthPayload>).data;
}

/** Kasiyer rolüyle bir kullanıcı açar ve onun oturumunu döndürür. */
async function createCashier(owner: AuthPayload): Promise<AuthPayload> {
  const roles = await request(server).get('/roles').set(authHeader(owner.accessToken)).expect(200);
  const cashierRole = (roles.body as Envelope<{ id: string; name: string }[]>).data.find(
    (role) => role.name === SYSTEM_ROLES.CASHIER,
  );
  expect(cashierRole).toBeDefined();

  const email = `kasiyer-${randomUUID()}@stokk.test`;
  await request(server)
    .post('/users')
    .set(authHeader(owner.accessToken))
    .send({
      email,
      password: 'KasiyerParola1',
      fullName: 'Test Kasiyer',
      roleIds: [cashierRole!.id],
    })
    .expect(201);

  const login = await request(server)
    .post('/auth/login')
    .set('X-Forwarded-For', nextIp())
    .send({ email, password: 'KasiyerParola1' })
    .expect(200);
  return (login.body as Envelope<AuthPayload>).data;
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
  await prisma.tenant.deleteMany({ where: { name: { startsWith: 'FAZ11-GAP ' } } });
  await prisma.$disconnect();
  await app.close();
});

describe('kasiyer yetki sınırı', () => {
  it('kasiyer kâr raporuna doğrudan URL ile de erişemez (403)', async () => {
    const owner = await registerTenant('FAZ11-GAP Kasiyer');
    const cashier = await createCashier(owner);

    // Kasiyer izin listesinde kâr raporu YOK — menüde de görünmez.
    expect(cashier.user).toBeDefined();
    const me = await request(server)
      .get('/auth/me')
      .set(authHeader(cashier.accessToken))
      .expect(200);
    const permissions = (me.body as Envelope<{ permissions: string[] }>).data.permissions;
    expect(permissions).not.toContain(PERMISSIONS.REPORT_PROFIT_VIEW);

    const range = { from: '2026-01-01T00:00:00.000Z', to: '2026-12-31T23:59:59.999Z' };

    // Doğrudan URL: guard 403 verir.
    await request(server)
      .get('/reports/profit')
      .query({ ...range, granularity: 'day' })
      .set(authHeader(cashier.accessToken))
      .expect(403);

    // Patron aynı ucu görebilir — kısıt role bağlı, uca değil.
    await request(server)
      .get('/reports/profit')
      .query({ ...range, granularity: 'day' })
      .set(authHeader(owner.accessToken))
      .expect(200);
  });

  it('kasiyer ayarlara ve denetim kaydına da erişemez', async () => {
    const owner = await registerTenant('FAZ11-GAP KasiyerYonetim');
    const cashier = await createCashier(owner);

    await request(server).get('/settings').set(authHeader(cashier.accessToken)).expect(403);
    await request(server).get('/audit-logs').set(authHeader(cashier.accessToken)).expect(403);
    await request(server).get('/roles').set(authHeader(cashier.accessToken)).expect(403);

    await request(server).get('/settings').set(authHeader(owner.accessToken)).expect(200);
    await request(server).get('/audit-logs').set(authHeader(owner.accessToken)).expect(200);
  });
});

describe('ayar kimlik bilgileri', () => {
  it('kimlik bilgisi maskeli döner, düz metin ASLA sızmaz', async () => {
    const owner = await registerTenant('FAZ11-GAP Ayar');
    const auth = authHeader(owner.accessToken);

    await request(server)
      .patch('/settings')
      .set(auth)
      .send({ eInvoiceUsername: 'entegrator-user', eInvoiceSecret: 'CokGizliEntegratorParolasi' })
      .expect(200);

    const res = await request(server)
      .get('/settings')
      .set(authHeader(owner.accessToken))
      .expect(200);
    const body = res.body as Envelope<{
      settings: { eInvoiceUsername: string | null; eInvoiceSecretMask: string | null };
    }>;

    expect(body.data.settings.eInvoiceUsername).toBe('entegrator-user');
    expect(body.data.settings.eInvoiceSecretMask).toBe('••••lasi');
    // Ne düz metin ne de şifreli sütun yanıtta olmalı.
    expect(JSON.stringify(body)).not.toContain('CokGizliEntegratorParolasi');
    expect(JSON.stringify(body)).not.toContain('eInvoiceSecretEnc');
  });

  it('kimlik bilgisi YENİDEN YAZILMADIKÇA değişmez', async () => {
    const owner = await registerTenant('FAZ11-GAP AyarKoruma');

    await request(server)
      .patch('/settings')
      .set(authHeader(owner.accessToken))
      .send({ smsApiKey: 'ILK-ANAHTAR-1111' })
      .expect(200);

    // Başka bir alan güncellenir, anahtar alanı GÖNDERİLMEZ.
    await request(server)
      .patch('/settings')
      .set(authHeader(owner.accessToken))
      .send({ smsSenderTitle: 'STOKK' })
      .expect(200);

    const res = await request(server)
      .get('/settings')
      .set(authHeader(owner.accessToken))
      .expect(200);
    const settings = (
      res.body as Envelope<{
        settings: { smsApiKeyMask: string | null; smsSenderTitle: string | null };
      }>
    ).data.settings;
    expect(settings.smsSenderTitle).toBe('STOKK');
    expect(settings.smsApiKeyMask).toBe('••••1111');

    // Boş string AÇIKÇA silme anlamına gelir.
    await request(server)
      .patch('/settings')
      .set(authHeader(owner.accessToken))
      .send({ smsApiKey: '' })
      .expect(200);
    const cleared = await request(server)
      .get('/settings')
      .set(authHeader(owner.accessToken))
      .expect(200);
    expect(
      (cleared.body as Envelope<{ settings: { smsApiKeyMask: string | null } }>).data.settings
        .smsApiKeyMask,
    ).toBeNull();
  });
});

describe('kendini kilitleme koruması', () => {
  it('son yetkili rolünden rol yönetme izni kaldırılamaz', async () => {
    const owner = await registerTenant('FAZ11-GAP Kilit');
    const auth = authHeader(owner.accessToken);

    const roles = await request(server).get('/roles').set(auth).expect(200);
    const ownerRole = (
      roles.body as Envelope<
        { id: string; name: string; permissions: { permission: { code: string } }[] }[]
      >
    ).data.find((role) => role.name === SYSTEM_ROLES.OWNER);
    expect(ownerRole).toBeDefined();

    const withoutRoleManage = ownerRole!.permissions
      .map((entry) => entry.permission.code)
      .filter((code) => code !== PERMISSIONS.ROLE_MANAGE);

    const res = await request(server)
      .patch(`/roles/${ownerRole!.id}`)
      .set(authHeader(owner.accessToken))
      // BusinessRuleError → 400 (domain-error.ts).
      .send({ permissions: withoutRoleManage })
      .expect(400);
    expect((res.body as Envelope<unknown>).error?.code).toBe('LAST_ROLE_ADMIN');

    // İzin hâlâ duruyor: reddedilen istek kısmi yazma bırakmadı.
    const after = await request(server)
      .get('/roles')
      .set(authHeader(owner.accessToken))
      .expect(200);
    const stillOwner = (
      after.body as Envelope<{ name: string; permissions: { permission: { code: string } }[] }[]>
    ).data.find((role) => role.name === SYSTEM_ROLES.OWNER);
    expect(stillOwner!.permissions.map((e) => e.permission.code)).toContain(
      PERMISSIONS.ROLE_MANAGE,
    );
  });

  it('kullanıcı kendi adını değiştirebilir (roller değişmiyorsa reddedilmez)', async () => {
    const owner = await registerTenant('FAZ11-GAP KendiProfil');

    const me = await request(server).get('/users').set(authHeader(owner.accessToken)).expect(200);
    const self = (
      me.body as Envelope<{ id: string; roles: { role: { id: string } }[] }[]>
    ).data.find((user) => user.id === owner.user.id);
    expect(self).toBeDefined();

    // Ekranın gönderdiği gibi: roller AYNI, yalnız ad değişiyor.
    const res = await request(server)
      .patch(`/users/${owner.user.id}`)
      .set(authHeader(owner.accessToken))
      .send({ fullName: 'Yeni Ad Soyad', roleIds: self!.roles.map((entry) => entry.role.id) })
      .expect(200);
    expect((res.body as Envelope<{ fullName: string }>).data.fullName).toBe('Yeni Ad Soyad');
  });
});
