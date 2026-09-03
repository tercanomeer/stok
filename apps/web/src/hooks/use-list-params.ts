'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

import {
  listParamsToQuery,
  parseListParams,
  type ListParams,
  type ListParamsConfig,
} from '../lib/list-params';

export interface ListParamsApi {
  params: ListParams;
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;
  setSearch: (search: string) => void;
  setSort: (sort: string) => void;
  setFilter: (key: string, value: string) => void;
  reset: () => void;
}

/**
 * Liste durumunu URL ile senkron tutar. Sayfa dışındaki her değişiklik
 * (arama, filtre, sıralama) sayfayı 1'e çeker — yoksa kullanıcı boş sayfada kalır.
 * `router.replace` kullanılır: filtre denemeleri tarayıcı geçmişini doldurmasın.
 *
 * `config` her render'da yeni nesnedir; bağımlılık olarak İÇERİĞİ kullanılır
 * (filtre anahtarları tek string'e indirgenir), referansı değil.
 */
export function useListParams(config: ListParamsConfig): ListParamsApi {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filterKeys = config.filterKeys.join(',');
  const { defaultLimit, defaultSort } = config;

  const resolvedConfig = useMemo<ListParamsConfig>(
    () => ({
      filterKeys: filterKeys ? filterKeys.split(',') : [],
      ...(defaultLimit === undefined ? {} : { defaultLimit }),
      ...(defaultSort === undefined ? {} : { defaultSort }),
    }),
    [filterKeys, defaultLimit, defaultSort],
  );

  const params = useMemo(
    () => parseListParams(searchParams.toString(), resolvedConfig),
    [searchParams, resolvedConfig],
  );

  const push = useCallback(
    (next: ListParams) => {
      const query = listParamsToQuery(next, resolvedConfig);
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, resolvedConfig],
  );

  const setPage = useCallback(
    (page: number) => {
      push({ ...params, page });
    },
    [push, params],
  );

  const setLimit = useCallback(
    (limit: number) => {
      push({ ...params, limit, page: 1 });
    },
    [push, params],
  );

  const setSearch = useCallback(
    (search: string) => {
      push({ ...params, search, page: 1 });
    },
    [push, params],
  );

  const setSort = useCallback(
    (sort: string) => {
      push({ ...params, sort, page: 1 });
    },
    [push, params],
  );

  const setFilter = useCallback(
    (key: string, value: string) => {
      push({ ...params, filters: { ...params.filters, [key]: value }, page: 1 });
    },
    [push, params],
  );

  const reset = useCallback(() => {
    push({ page: 1, limit: params.limit, search: '', sort: '', filters: {} });
  }, [push, params.limit]);

  return { params, setPage, setLimit, setSearch, setSort, setFilter, reset };
}
