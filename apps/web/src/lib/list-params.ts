/**
 * Liste ekranlarının ortak sorgu durumu (sayfa / arama / sıralama / filtreler).
 * URL'de yaşar: yenilemede, geri tuşunda ve paylaşılan linkte aynı liste açılır.
 *
 * Buradaki fonksiyonlar SAF — React'e bağlı değil, doğrudan test edilir.
 * Backend sözleşmesi: ?page=1&limit=20&sort=alan:yon&search= (CLAUDE.md).
 */

export interface ListParamsConfig {
  /** Filtre anahtarları; URL'de ve API sorgusunda aynı adla taşınır. */
  filterKeys: readonly string[];
  defaultLimit?: number;
  defaultSort?: string;
}

export interface ListParams {
  page: number;
  limit: number;
  search: string;
  sort: string;
  filters: Record<string, string>;
}

const MAX_LIMIT = 100;

function toPositiveInt(raw: string | null, fallback: number, max?: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return max ? Math.min(parsed, max) : parsed;
}

/** URL sorgusundan liste durumunu çıkarır; bozuk değerler varsayılana düşer. */
export function parseListParams(
  search: URLSearchParams | string,
  config: ListParamsConfig,
): ListParams {
  const sp = typeof search === 'string' ? new URLSearchParams(search) : search;
  const filters: Record<string, string> = {};
  for (const key of config.filterKeys) {
    const value = sp.get(key);
    if (value) filters[key] = value;
  }
  return {
    page: toPositiveInt(sp.get('page'), 1),
    limit: toPositiveInt(sp.get('limit'), config.defaultLimit ?? 20, MAX_LIMIT),
    search: sp.get('search') ?? '',
    sort: sp.get('sort') ?? config.defaultSort ?? '',
    filters,
  };
}

/**
 * Liste durumunu URL sorgusuna çevirir. Varsayılan değerler YAZILMAZ —
 * adres çubuğu temiz kalır ve aynı liste tek bir kanonik URL üretir.
 */
export function listParamsToQuery(params: ListParams, config: ListParamsConfig): string {
  const sp = new URLSearchParams();
  if (params.page > 1) sp.set('page', String(params.page));
  if (params.limit !== (config.defaultLimit ?? 20)) sp.set('limit', String(params.limit));
  if (params.search) sp.set('search', params.search);
  if (params.sort && params.sort !== (config.defaultSort ?? '')) sp.set('sort', params.sort);
  for (const key of config.filterKeys) {
    const value = params.filters[key];
    if (value) sp.set(key, value);
  }
  return sp.toString();
}

/** API'ye gönderilecek sorgu nesnesi (axios `params`). Boş alanlar atlanır. */
export function listParamsToApiQuery(params: ListParams): Record<string, string | number> {
  const query: Record<string, string | number> = { page: params.page, limit: params.limit };
  if (params.search) query.search = params.search;
  if (params.sort) query.sort = params.sort;
  for (const [key, value] of Object.entries(params.filters)) {
    if (value) query[key] = value;
  }
  return query;
}

/**
 * `alan:yon` sıralamasında bir sütuna tıklandığında sıradaki değer:
 * aynı sütun → yön ters çevrilir, farklı sütun → o sütun artan.
 */
export function nextSort(current: string, field: string): string {
  const [currentField, currentDirection] = current.split(':');
  if (currentField !== field) return `${field}:asc`;
  return `${field}:${currentDirection === 'asc' ? 'desc' : 'asc'}`;
}

/** Sütunun mevcut sıralama yönü; sıralanmıyorsa null. */
export function sortDirection(current: string, field: string): 'asc' | 'desc' | null {
  const [currentField, currentDirection] = current.split(':');
  if (currentField !== field) return null;
  return currentDirection === 'desc' ? 'desc' : 'asc';
}
