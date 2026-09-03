'use client';

import { useEffect } from 'react';

import type { PaginationMeta } from '../lib/api-types';

/**
 * Son sayfadaki kayıtlar silinince kullanıcı var olmayan bir sayfada kalır:
 * sunucu istenen sayfayı aynen geri döndürdüğü için liste boşalır ve sayaç
 * "3 / 2" gibi tutarsız görünür. Meta gerçek sayfa sayısını aşınca son geçerli
 * sayfaya çekiyoruz.
 */
export function usePageClamp(
  meta: PaginationMeta | undefined,
  setPage: (page: number) => void,
): void {
  const page = meta?.page;
  const pages = meta?.pages;

  useEffect(() => {
    if (page !== undefined && pages !== undefined && page > pages) setPage(pages);
  }, [page, pages, setPage]);
}
