import { describe, expect, it, vi } from 'vitest';

import { ApiClient, ApiRequestError, type TokenPair, type TokenStore } from './api-client';

function memoryTokens(initial: TokenPair | null = null): TokenStore & { value: TokenPair | null } {
  return {
    value: initial,
    read() {
      return this.value;
    },
    write(tokens: TokenPair) {
      this.value = tokens;
    },
    clear() {
      this.value = null;
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ApiClient', () => {
  it('zarfı açar ve data döner', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ ok: true, data: { id: 'p1' } }));
    const api = new ApiClient({
      getBaseUrl: () => 'https://api.test',
      tokens: memoryTokens(),
      fetchImpl: fetchImpl,
    });

    await expect(api.request<{ id: string }>('/products')).resolves.toEqual({ id: 'p1' });
  });

  it('hata zarfını kod ve mesajıyla fırlatır', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ ok: false, error: { code: 'NOT_FOUND', message: 'Bulunamadı.' } }, 404),
      );
    const api = new ApiClient({
      getBaseUrl: () => 'https://api.test',
      tokens: memoryTokens(),
      fetchImpl: fetchImpl,
    });

    await expect(api.request('/products/x')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Bulunamadı.',
      retriable: false,
    });
  });

  it('ağ hatasını YENİDEN DENENEBİLİR olarak işaretler', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const api = new ApiClient({
      getBaseUrl: () => 'https://api.test',
      tokens: memoryTokens(),
      fetchImpl: fetchImpl,
    });

    const error = await api.request('/health').catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).retriable).toBe(true);
  });

  it('5xx yeniden denenebilir, 4xx değil', async () => {
    const tokens = memoryTokens();
    const make = (status: number): ApiClient =>
      new ApiClient({
        getBaseUrl: () => 'https://api.test',
        tokens,
        fetchImpl: vi
          .fn()
          .mockResolvedValue(
            jsonResponse({ ok: false, error: { code: 'X', message: 'x' } }, status),
          ),
      });

    await expect(make(503).request('/x')).rejects.toMatchObject({ retriable: true });
    await expect(make(422).request('/x')).rejects.toMatchObject({ retriable: false });
  });

  it('401 alınca token yeniler ve isteği bir kez tekrarlar', async () => {
    const tokens = memoryTokens({ accessToken: 'eski', refreshToken: 'r1' });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'x' } }, 401),
      )
      .mockResolvedValueOnce(
        jsonResponse({ ok: true, data: { accessToken: 'yeni', refreshToken: 'r2' } }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { total: 3 } }));

    const api = new ApiClient({
      getBaseUrl: () => 'https://api.test',
      tokens,
      fetchImpl: fetchImpl,
    });

    await expect(api.request<{ total: number }>('/products')).resolves.toEqual({ total: 3 });
    expect(tokens.value).toEqual({ accessToken: 'yeni', refreshToken: 'r2' });

    // Son istek YENİ token'ı taşıdı.
    const lastCall = fetchImpl.mock.calls.at(-1) as [string, RequestInit];
    expect((lastCall[1].headers as Record<string, string>).Authorization).toBe('Bearer yeni');
  });

  it('eşzamanlı 401ler TEK refresh çağrısı paylaşır (rotasyonlu token kırılmasın)', async () => {
    const tokens = memoryTokens({ accessToken: 'eski', refreshToken: 'r1' });
    let refreshCalls = 0;

    const fetchImpl = vi.fn((url: string) => {
      if (url.includes('/auth/refresh')) {
        refreshCalls += 1;
        return Promise.resolve(
          jsonResponse({ ok: true, data: { accessToken: 'yeni', refreshToken: 'r2' } }),
        );
      }
      const authorization = 'eski';
      const isStale = fetchImpl.mock.calls.filter(
        (call) => !String(call[0]).includes('refresh'),
      ).length;
      // İlk iki istek eski token ile gelir → 401; sonrası 200.
      return Promise.resolve(
        isStale <= 2
          ? jsonResponse({ ok: false, error: { code: 'U', message: authorization } }, 401)
          : jsonResponse({ ok: true, data: 'tamam' }),
      );
    });

    const api = new ApiClient({
      getBaseUrl: () => 'https://api.test',
      tokens,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await Promise.all([api.request('/a'), api.request('/b')]);
    expect(refreshCalls).toBe(1);
  });

  it('refresh de reddedilirse oturum düşürülür', async () => {
    const tokens = memoryTokens({ accessToken: 'eski', refreshToken: 'r1' });
    const onUnauthenticated = vi.fn();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ok: false, error: { code: 'U', message: 'x' } }, 401))
      .mockResolvedValueOnce(
        jsonResponse({ ok: false, error: { code: 'U', message: 'Oturum doldu.' } }, 401),
      );

    const api = new ApiClient({
      getBaseUrl: () => 'https://api.test',
      tokens,
      fetchImpl: fetchImpl,
      onUnauthenticated,
    });

    await expect(api.request('/products')).rejects.toThrow();
    expect(onUnauthenticated).toHaveBeenCalledOnce();
    expect(tokens.value).toBeNull();
  });

  it('sunucu adresi yoksa ağ hatası verir (istek atılmaz)', async () => {
    const fetchImpl = vi.fn();
    const api = new ApiClient({
      getBaseUrl: () => null,
      tokens: memoryTokens(),
      fetchImpl: fetchImpl,
    });

    await expect(api.request('/health')).rejects.toMatchObject({ code: 'NO_SERVER_URL' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
