import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';

import type { ApiError, ApiSuccess } from '@stokk/types';

import type { AuthSession } from './api-types';
import { API_URL } from './env';
import { useAuthStore } from '../stores/auth-store';

/** Zarflı yanıtın data'sını açar; her metod `T` döner, zarfı değil. */
export const api = axios.create({ baseURL: API_URL, timeout: 20_000 });

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

// Tek uçuş: eşzamanlı 401'ler tek refresh çağrısını paylaşır, sıraya girer.
let refreshPromise: Promise<string> | null = null;

async function runRefresh(): Promise<string> {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) throw new Error('no-refresh-token');
  // Interceptor'lı instance'ı KULLANMA (özyineleme) — çıplak istek.
  const res = await axios.post<ApiSuccess<AuthSession>>(`${API_URL}/auth/refresh`, {
    refreshToken,
  });
  const session = res.data.data;
  useAuthStore
    .getState()
    .setTokens({ accessToken: session.accessToken, refreshToken: session.refreshToken });
  return session.accessToken;
}

function forceLogout(): void {
  useAuthStore.getState().clear();
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!(error instanceof AxiosError) || !error.response) {
      return Promise.reject(error instanceof Error ? error : new Error('İstek başarısız.'));
    }
    const original = error.config as RetriableConfig | undefined;
    // runRefresh çıplak axios kullanır (bu interceptor'dan geçmez), yani refresh'in
    // kendi 401'i buraya normalde ulaşmaz; isAuthCall yine de savunma katmanı
    // (ör. ileride refresh `api` üzerinden çağrılırsa özyinelemeyi keser).
    const isAuthCall = original?.url?.includes('/auth/refresh') ?? false;

    if (error.response.status !== 401 || !original || original._retry || isAuthCall) {
      return Promise.reject(error);
    }

    original._retry = true;
    try {
      refreshPromise ??= runRefresh().finally(() => {
        refreshPromise = null;
      });
      const token = await refreshPromise;
      original.headers.set('Authorization', `Bearer ${token}`);
      return api.request(original);
    } catch (refreshError) {
      forceLogout();
      return Promise.reject(
        refreshError instanceof Error ? refreshError : new Error('refresh-failed'),
      );
    }
  },
);

/** GET → zarf açılmış veri. */
export async function apiGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const res = await api.get<ApiSuccess<T>>(url, config);
  return res.data.data;
}

/** POST → zarf açılmış veri. */
export async function apiPost<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const res = await api.post<ApiSuccess<T>>(url, body, config);
  return res.data.data;
}

/** POST → gövdesiz (204) uçlar için; yanıt yok sayılır. */
export async function apiPostVoid(url: string, body?: unknown): Promise<void> {
  await api.post(url, body);
}

/** Axios hatasından kullanıcıya gösterilecek Türkçe mesajı çıkarır. */
export function apiErrorMessage(
  error: unknown,
  fallback = 'Bir hata oluştu, tekrar deneyin.',
): string {
  if (error instanceof AxiosError && error.response) {
    const body = error.response.data as ApiError | undefined;
    if (body && body.ok === false) return body.error.message;
  }
  return fallback;
}
