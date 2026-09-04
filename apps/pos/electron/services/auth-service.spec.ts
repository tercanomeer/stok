import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClient } from './api-client';
import { AuthService } from './auth-service';
import { ConfigStore } from './config-store';
import { SessionTokenStore, type SecretCipher } from './secure-store';
import { openDatabase, type PosDatabase } from '../db/database';
import { findSessionByEmail } from '../db/session-repo';

const NOW = new Date('2026-09-03T10:00:00.000Z');

/** safeStorage yerine test şifreleyicisi — gerçek şifreleme electron'a bağlı. */
const fakeCipher: SecretCipher = {
  available: true,
  encrypt: (plain) => Buffer.from(`enc:${plain}`, 'utf8'),
  decrypt: (blob) => blob.toString('utf8').replace(/^enc:/, ''),
};

const PRINCIPAL = {
  id: 'u1',
  tenantId: 't1',
  email: 'kasiyer@stokk.test',
  fullName: 'Ayşe Kasiyer',
  permissions: ['sale.create'],
  roles: ['KASIYER'],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface Harness {
  db: PosDatabase;
  auth: AuthService;
  config: ConfigStore;
  tokens: SessionTokenStore;
  fetchImpl: ReturnType<typeof vi.fn>;
  setClock(date: Date): void;
}

let tempDir: string;

function harness(): Harness {
  const db = openDatabase(':memory:');
  const config = new ConfigStore(path.join(tempDir, `config-${String(Math.random())}.json`));
  config.patch({ serverUrl: 'https://api.test' });
  const fetchImpl = vi.fn();
  const tokens = new SessionTokenStore(db, fakeCipher, () => NOW);
  const api = new ApiClient({
    getBaseUrl: () => config.get().serverUrl,
    tokens,
    fetchImpl: fetchImpl,
  });
  let clock = NOW;
  const auth = new AuthService({ db, api, tokens, config, clock: () => clock });
  return {
    db,
    auth,
    config,
    tokens,
    fetchImpl,
    setClock: (date) => {
      clock = date;
    },
  };
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stokk-pos-auth-'));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('çevrimiçi giriş', () => {
  it('oturumu önbelleğe alır, şifreli token saklar', async () => {
    const h = harness();
    h.fetchImpl.mockResolvedValue(
      jsonResponse({
        ok: true,
        data: { accessToken: 'a1', refreshToken: 'r1', expiresIn: 900, user: PRINCIPAL },
      }),
    );

    const session = await h.auth.login({ email: 'Kasiyer@Stokk.test', password: 'Sifre!123' });

    expect(session.offline).toBe(false);
    expect(session.user.id).toBe('u1');

    const stored = findSessionByEmail(h.db, 'kasiyer@stokk.test');
    expect(stored).not.toBeNull();
    // Diskte düz metin token YOK.
    expect(stored?.tokenBlob?.toString('utf8')).toBe(
      'enc:{"accessToken":"a1","refreshToken":"r1"}',
    );
    // Parola da düz metin saklanmaz.
    expect(stored?.passwordHash).not.toContain('Sifre!123');
    expect(h.config.get().lastEmail).toBe('kasiyer@stokk.test');
  });

  it('sunucu reddederse (4xx) çevrimdışına DÜŞMEZ', async () => {
    const h = harness();
    h.fetchImpl.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        data: { accessToken: 'a1', refreshToken: 'r1', expiresIn: 900, user: PRINCIPAL },
      }),
    );
    await h.auth.login({ email: PRINCIPAL.email, password: 'Sifre!123' });
    await h.auth.logout();

    // Hesap pasife alındı: doğru parolayla bile giriş olmamalı.
    h.fetchImpl.mockResolvedValue(
      jsonResponse({ ok: false, error: { code: 'FORBIDDEN', message: 'Hesabınız pasif.' } }, 403),
    );

    await expect(
      h.auth.login({ email: PRINCIPAL.email, password: 'Sifre!123' }),
    ).rejects.toMatchObject({ message: 'Hesabınız pasif.' });
    expect(h.auth.session).toBeNull();
  });
});

describe('çevrimdışı giriş', () => {
  async function seedOnlineLogin(h: Harness): Promise<void> {
    h.fetchImpl.mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        data: { accessToken: 'a1', refreshToken: 'r1', expiresIn: 900, user: PRINCIPAL },
      }),
    );
    await h.auth.login({ email: PRINCIPAL.email, password: 'Sifre!123' });
    await h.auth.logout();
    h.fetchImpl.mockReset();
  }

  it('sunucuya ulaşılamadığında önbellekteki parola ile giriş yapılır', async () => {
    const h = harness();
    await seedOnlineLogin(h);
    h.fetchImpl.mockRejectedValue(new Error('ECONNREFUSED'));

    const session = await h.auth.login({ email: PRINCIPAL.email, password: 'Sifre!123' });

    expect(session.offline).toBe(true);
    expect(session.user.permissions).toEqual(['sale.create']);
  });

  it('yanlış parola çevrimdışında da reddedilir', async () => {
    const h = harness();
    await seedOnlineLogin(h);
    h.fetchImpl.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      h.auth.login({ email: PRINCIPAL.email, password: 'yanlis' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('bu kasada hiç giriş yapmamış kullanıcı çevrimdışı giremez', async () => {
    const h = harness();
    h.fetchImpl.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      h.auth.login({ email: 'yabanci@stokk.test', password: 'Sifre!123' }),
    ).rejects.toMatchObject({ code: 'OFFLINE_LOGIN_UNAVAILABLE' });
  });

  it('süre sınırı aşıldığında çevrimdışı giriş kapanır', async () => {
    const h = harness();
    await seedOnlineLogin(h);
    h.fetchImpl.mockRejectedValue(new Error('ECONNREFUSED'));

    // Varsayılan 7 gün; 8 gün sonra kasada süresiz açık kalmamalı.
    h.setClock(new Date(NOW.getTime() + 8 * 86_400_000));

    await expect(
      h.auth.login({ email: PRINCIPAL.email, password: 'Sifre!123' }),
    ).rejects.toMatchObject({ code: 'OFFLINE_GRACE_EXPIRED' });
  });
});

describe('oturum geri yükleme', () => {
  it('token varsa açılışta oturum geri gelir', async () => {
    const h = harness();
    h.fetchImpl.mockResolvedValue(
      jsonResponse({
        ok: true,
        data: { accessToken: 'a1', refreshToken: 'r1', expiresIn: 900, user: PRINCIPAL },
      }),
    );
    await h.auth.login({ email: PRINCIPAL.email, password: 'Sifre!123' });

    const restored = h.auth.restoreLast(h.config.get().lastEmail);
    expect(restored?.user.id).toBe('u1');
    expect(h.tokens.read()).toEqual({ accessToken: 'a1', refreshToken: 'r1' });
  });

  it('çıkış yapılmışsa (token silinmiş) oturum geri YÜKLENMEZ', async () => {
    const h = harness();
    h.fetchImpl.mockResolvedValue(
      jsonResponse({
        ok: true,
        data: { accessToken: 'a1', refreshToken: 'r1', expiresIn: 900, user: PRINCIPAL },
      }),
    );
    await h.auth.login({ email: PRINCIPAL.email, password: 'Sifre!123' });
    await h.auth.logout();

    expect(h.auth.restoreLast(h.config.get().lastEmail)).toBeNull();
  });

  it('hiç giriş yapılmamışsa null döner', () => {
    const h = harness();
    expect(h.auth.restoreLast(null)).toBeNull();
  });
});
