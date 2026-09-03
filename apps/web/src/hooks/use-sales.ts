'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { apiGet, apiPost, apiPostVoid } from '../lib/api';
import type { Paginated, PaymentMethod, Receipt, SaleDetail, SaleListRow } from '../lib/api-types';
import { listParamsToApiQuery, type ListParams } from '../lib/list-params';

export function useSales(params: ListParams): UseQueryResult<Paginated<SaleListRow>> {
  const query = listParamsToApiQuery(params);
  return useQuery({
    queryKey: ['sales', query],
    queryFn: () => apiGet<Paginated<SaleListRow>>('/sales', { params: query }),
    placeholderData: (previous) => previous,
  });
}

export function useSale(id: string | undefined): UseQueryResult<SaleDetail> {
  return useQuery({
    queryKey: ['sales', 'detail', id],
    queryFn: () => apiGet<SaleDetail>(`/sales/${id ?? ''}`),
    enabled: Boolean(id),
  });
}

/** Fiş verisi — başlık/altlık tenant ayarlarından gelir, yazdırma bunu kullanır. */
export function useReceipt(id: string | undefined, enabled = true): UseQueryResult<Receipt> {
  return useQuery({
    queryKey: ['sales', 'receipt', id],
    queryFn: () => apiGet<Receipt>(`/sales/${id ?? ''}/receipt`),
    enabled: Boolean(id) && enabled,
  });
}

export interface ReturnPayload {
  saleId: string;
  refundMethod: PaymentMethod;
  reason: string;
  items: { saleItemId: string; quantity: string }[];
}

/**
 * İade satışı, stoğu, kasayı ve cariyi birlikte etkiler; hepsinin cache'i tazelenir.
 * Miktar sınırını sunucu doğrular (RETURN_EXCEEDS_SOLD) — ekran yalnız önden uyarır.
 */
export function useCreateReturn(): UseMutationResult<unknown, Error, ReturnPayload> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ saleId, ...body }: ReturnPayload) =>
      apiPost<unknown>(`/sales/${saleId}/returns`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sales'] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
      void queryClient.invalidateQueries({ queryKey: ['cash-sessions'] });
    },
  });
}

export function useCancelSale(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPostVoid(`/sales/${id}/cancel`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sales'] });
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
    },
  });
}
