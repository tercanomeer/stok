'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { apiGet, apiPost, apiPostVoid } from '../lib/api';
import type {
  LowStockRow,
  Paginated,
  StockCountCompleteResult,
  StockCountDetail,
  StockCountListItem,
  StockMovement,
} from '../lib/api-types';
import { listParamsToApiQuery, type ListParams } from '../lib/list-params';

export function useStockMovements(params: ListParams): UseQueryResult<Paginated<StockMovement>> {
  const query = listParamsToApiQuery(params);
  return useQuery({
    queryKey: ['stock', 'movements', query],
    queryFn: () => apiGet<Paginated<StockMovement>>('/stock/movements', { params: query }),
    placeholderData: (previous) => previous,
  });
}

export function useLowStock(enabled = true): UseQueryResult<LowStockRow[]> {
  return useQuery({
    queryKey: ['stock', 'low'],
    queryFn: () => apiGet<LowStockRow[]>('/stock/low'),
    enabled,
  });
}

export interface WastePayload {
  productId: string;
  quantity: string;
  reason: string;
}

/** Stok değişimi ürün listesini de bozar: iki cache birden geçersiz kılınır. */
function invalidateStock(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: ['stock'] });
  void queryClient.invalidateQueries({ queryKey: ['products'] });
}

export function useRecordWaste(): UseMutationResult<unknown, Error, WastePayload> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: WastePayload) => apiPost<unknown>('/stock/waste', payload),
    onSuccess: () => {
      invalidateStock(queryClient);
    },
  });
}

export interface AdjustPayload {
  productId: string;
  /** Sayılan/doğru miktar — fark backend'de hesaplanır. */
  newQuantity: string;
  reason: string;
}

export function useAdjustStock(): UseMutationResult<unknown, Error, AdjustPayload> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AdjustPayload) => apiPost<unknown>('/stock/adjust', payload),
    onSuccess: () => {
      invalidateStock(queryClient);
    },
  });
}

// --- Sayım ---

export function useStockCounts(): UseQueryResult<StockCountListItem[]> {
  return useQuery({
    queryKey: ['stock', 'counts'],
    queryFn: () => apiGet<StockCountListItem[]>('/stock/counts'),
  });
}

export function useStockCount(id: string | undefined): UseQueryResult<StockCountDetail> {
  return useQuery({
    queryKey: ['stock', 'counts', id],
    queryFn: () => apiGet<StockCountDetail>(`/stock/counts/${id ?? ''}`),
    enabled: Boolean(id),
  });
}

export function useStartCount(): UseMutationResult<
  { id: string; code: string },
  Error,
  { note?: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { note?: string }) =>
      apiPost<{ id: string; code: string }>('/stock/counts', payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stock', 'counts'] });
    },
  });
}

export interface AddCountItemArgs {
  countId: string;
  /** Barkod veya ürün id'si. */
  product: string;
  /** Bu okutmada eklenen miktar; aynı ürün tekrar okutulursa birikir. */
  quantity: string;
}

/**
 * Kalem ekleme sayım DEVAM EDERKEN stoğu değiştirmez (yalnız sayılan miktarı yazar).
 * Yanıt kalem adını taşımadığı için sayım detayı tazelenir — canlı fark tablosu böyle güncellenir.
 */
export function useAddCountItem(): UseMutationResult<unknown, Error, AddCountItemArgs> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ countId, product, quantity }: AddCountItemArgs) =>
      apiPost<unknown>(`/stock/counts/${countId}/items`, { product, quantity }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['stock', 'counts', variables.countId] });
    },
  });
}

export function useCompleteCount(): UseMutationResult<StockCountCompleteResult, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (countId: string) =>
      apiPost<StockCountCompleteResult>(`/stock/counts/${countId}/complete`),
    onSuccess: () => {
      invalidateStock(queryClient);
    },
  });
}

export function useCancelCount(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (countId: string) => apiPostVoid(`/stock/counts/${countId}/cancel`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stock', 'counts'] });
    },
  });
}
