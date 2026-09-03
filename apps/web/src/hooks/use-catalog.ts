'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api';
import type { Brand, Category, Unit } from '../lib/api-types';

/** Katalog listeleri nadiren değişir; ürün formunda her açılışta yeniden çekilmesin. */
const CATALOG_STALE_TIME = 5 * 60_000;

export function useCategories(): UseQueryResult<Category[]> {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => apiGet<Category[]>('/categories'),
    staleTime: CATALOG_STALE_TIME,
  });
}

export function useBrands(): UseQueryResult<Brand[]> {
  return useQuery({
    queryKey: ['brands'],
    queryFn: () => apiGet<Brand[]>('/brands'),
    staleTime: CATALOG_STALE_TIME,
  });
}

export function useUnits(): UseQueryResult<Unit[]> {
  return useQuery({
    queryKey: ['units'],
    queryFn: () => apiGet<Unit[]>('/units'),
    staleTime: CATALOG_STALE_TIME,
  });
}

/** id → ad eşlemesi; liste tablolarında kategori/marka/birim adını göstermek için. */
export function nameById<T extends { id: string; name: string }>(
  rows: T[] | undefined,
): Map<string, string> {
  return new Map((rows ?? []).map((row) => [row.id, row.name]));
}

type CatalogResource = 'categories' | 'brands' | 'units';

export interface CatalogMutationArgs<TBody> {
  /** Verilirse güncelleme, yoksa oluşturma. */
  id?: string;
  body: TBody;
}

/**
 * Katalog kaydı oluştur/güncelle. Kaynak adı hem URL hem query anahtarıdır,
 * üç ekran (kategori/marka/birim) aynı mutasyonu paylaşır.
 */
export function useSaveCatalogItem<TBody>(
  resource: CatalogResource,
): UseMutationResult<unknown, Error, CatalogMutationArgs<TBody>> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: CatalogMutationArgs<TBody>) =>
      id ? apiPatch<unknown>(`/${resource}/${id}`, body) : apiPost<unknown>(`/${resource}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [resource] });
    },
  });
}

export function useDeleteCatalogItem(
  resource: CatalogResource,
): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/${resource}/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [resource] });
    },
  });
}
