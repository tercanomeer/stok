import type { ApiResponse } from '@stokk/types';

/** Sunucudan alınan token çifti. Diske YALNIZ şifreli yazılır (secure-store). */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface TokenStore {
  read(): TokenPair | null;
  write(tokens: TokenPair): void;
  clear(): void;
}

export type ApiFailureKind = 'network' | 'http' | 'protocol';

/**
 * Sunucu isteğinin başarısızlığı. `kind === 'network'` geçici kabul edilir (kuyruk
 * yeniden dener); `http` 4xx kalıcı iş kuralı hatasıdır.
 */
export class ApiRequestError extends Error {
  constructor(
    readonly kind: ApiFailureKind,
    readonly code: string,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }

  /** Ağ/5xx: yeniden denemek anlamlı. 4xx: sunucu isteği anlayıp reddetti. */
  get retriable(): boolean {
    if (this.kind === 'network') return true;
    return this.status !== undefined && this.status >= 500;
  }
}

export interface ApiClientOptions {
  /** Sunucu adresi çalışma anında değişebilir (kurulum ekranı) — her istekte okunur. */
  getBaseUrl: () => string | null;
  tokens: TokenStore;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Token yenilenince çağrılır — çağıran tarafın kalıcı deposunu tazelemesi için. */
  onTokensRefreshed?: (tokens: TokenPair) => void;
  /** Refresh de reddedilirse çağrılır: oturum düştü. */
  onUnauthenticated?: () => void;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | undefined>;
  /** false ise Authorization başlığı eklenmez (login, health). */
  auth?: boolean;
}

/**
 * Sunucuya çıkan TEK kapı. Renderer doğrudan HTTP atmaz (03-mimari.md); token
 * yönetimi, zarf açma ve 401 → refresh akışı burada tek yerde toplanır.
 */
export class ApiClient {
  private refreshInFlight: Promise<string> | null = null;

  constructor(private readonly options: ApiClientOptions) {}

  private get fetchImpl(): typeof fetch {
    return this.options.fetchImpl ?? fetch;
  }

  /**
   * Verilen adresin bir Stokk sunucusu olup olmadığını KAYDETMEDEN dener (kurulum ekranı).
   * `/health` herkese açık; token gerekmez.
   */
  async probe(baseUrl: string): Promise<string | null> {
    const probeClient = new ApiClient({
      ...this.options,
      getBaseUrl: () => baseUrl,
      timeoutMs: 5_000,
    });
    const health = await probeClient.request<{ service?: string }>('/health', { auth: false });
    return health.service ?? null;
  }

  /** Zarfı açar, `data`yı döner. Hata durumunda `ApiRequestError` fırlatır. */
  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const useAuth = options.auth !== false;
    const response = await this.send(path, options, useAuth ? this.accessToken() : null);

    if (response.status === 401 && useAuth) {
      const token = await this.refreshAccessToken();
      const retried = await this.send(path, options, token);
      return this.unwrap<T>(retried);
    }

    return this.unwrap<T>(response);
  }

  private accessToken(): string | null {
    return this.options.tokens.read()?.accessToken ?? null;
  }

  private baseUrl(): string {
    const base = this.options.getBaseUrl();
    if (!base) {
      throw new ApiRequestError('network', 'NO_SERVER_URL', 'Sunucu adresi ayarlanmamış.');
    }
    return base.replace(/\/+$/, '');
  }

  private async send(
    path: string,
    options: RequestOptions,
    token: string | null,
  ): Promise<Response> {
    const url = new URL(`${this.baseUrl()}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, value);
    }

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      return await this.fetchImpl(url.toString(), {
        method: options.method ?? 'GET',
        headers,
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 20_000),
      });
    } catch (error) {
      throw new ApiRequestError(
        'network',
        'NETWORK_UNREACHABLE',
        error instanceof Error ? error.message : 'Sunucuya ulaşılamadı.',
      );
    }
  }

  private async unwrap<T>(response: Response): Promise<T> {
    if (response.status === 204) return undefined as T;

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      throw new ApiRequestError(
        'protocol',
        'INVALID_RESPONSE',
        'Sunucu beklenmedik bir yanıt döndü.',
        response.status,
      );
    }

    const envelope = parsed as ApiResponse<T>;
    if (envelope && typeof envelope === 'object' && 'ok' in envelope) {
      if (envelope.ok) return envelope.data;
      throw new ApiRequestError(
        'http',
        envelope.error.code,
        envelope.error.message,
        response.status,
      );
    }

    throw new ApiRequestError(
      'protocol',
      'INVALID_RESPONSE',
      'Sunucu beklenmedik bir yanıt döndü.',
      response.status,
    );
  }

  /**
   * Tek uçuş: eş zamanlı 401'ler aynı refresh çağrısını paylaşır. Aksi hâlde açılışta
   * paralel giden pull ve push iki ayrı refresh tetikler; rotasyonlu refresh token'da
   * ikincisi kesin başarısız olur ve oturum boşuna düşer.
   */
  private async refreshAccessToken(): Promise<string> {
    this.refreshInFlight ??= this.runRefresh().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async runRefresh(): Promise<string> {
    const current = this.options.tokens.read();
    if (!current) {
      this.options.onUnauthenticated?.();
      throw new ApiRequestError('http', 'NO_REFRESH_TOKEN', 'Oturum bulunamadı.', 401);
    }

    const response = await this.send(
      '/auth/refresh',
      { method: 'POST', body: { refreshToken: current.refreshToken }, auth: false },
      null,
    );

    let pair: TokenPair;
    try {
      pair = await this.unwrap<TokenPair>(response);
    } catch (error) {
      this.options.tokens.clear();
      this.options.onUnauthenticated?.();
      throw error;
    }

    this.options.tokens.write(pair);
    this.options.onTokensRefreshed?.(pair);
    return pair.accessToken;
  }
}
