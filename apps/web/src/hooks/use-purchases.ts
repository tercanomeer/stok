'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { apiGet, apiPatch, apiPost, apiPostVoid } from '../lib/api';
import type { Paginated, PurchaseDetail, PurchaseListItem } from '../lib/api-types';
import { listParamsToApiQuery, type ListParams } from '../lib/list-params';

export function usePurchases(params: ListParams): UseQueryResult<Paginated<PurchaseListItem>> {
  const query = listParamsToApiQuery(params);
  return useQuery({
    queryKey: ['purchases', query],
    queryFn: () => apiGet<Paginated<PurchaseListItem>>('/purchases', { params: query }),
    placeholderData: (previous) => previous,
  });
}

export function usePurchase(id: string | undefined): UseQueryResult<PurchaseDetail> {
  return useQuery({
    queryKey: ['purchases', 'detail', id],
    queryFn: () => apiGet<PurchaseDetail>(`/purchases/${id ?? ''}`),
    enabled: Boolean(id),
  });
}

export interface PurchaseItemPayload {
  productId: string;
  quantity: string;
  /** KDV HARİÇ birim alış fiyatı. */
  unitPrice: string;
  discountRate?: string;
  vatRate: number;
}

export interface PurchasePayload {
  contactId: string;
  invoiceNo?: string;
  invoiceDate: string;
  note?: string;
  items: PurchaseItemPayload[];
}

/**
 * Alış faturası tek transaction'da stok + maliyet + cari borcu etkiler; üçünün de
 * cache'i geçersiz kılınır, yoksa ekranlar birbirini tutmaz.
 */
function invalidatePurchaseEffects(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: ['purchases'] });
  void queryClient.invalidateQueries({ queryKey: ['products'] });
  void queryClient.invalidateQueries({ queryKey: ['stock'] });
  void queryClient.invalidateQueries({ queryKey: ['contacts'] });
}

export function useCreatePurchase(): UseMutationResult<PurchaseDetail, Error, PurchasePayload> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: PurchasePayload) => apiPost<PurchaseDetail>('/purchases', payload),
    onSuccess: () => {
      invalidatePurchaseEffects(queryClient);
    },
  });
}

export interface UpdatePurchaseArgs {
  id: string;
  /** YALNIZ belge bilgileri; kalemler değiştirilemez (sunucu da kabul etmez). */
  body: { invoiceNo?: string | null; invoiceDate?: string; note?: string | null };
}

export function useUpdatePurchase(): UseMutationResult<PurchaseDetail, Error, UpdatePurchaseArgs> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: UpdatePurchaseArgs) =>
      apiPatch<PurchaseDetail>(`/purchases/${id}`, body),
    onSuccess: () => {
      // Yalnız belge bilgileri değişti; stok/maliyet/cari etkilenmez.
      void queryClient.invalidateQueries({ queryKey: ['purchases'] });
    },
  });
}

export function useCancelPurchase(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPostVoid(`/purchases/${id}/cancel`),
    onSuccess: () => {
      invalidatePurchaseEffects(queryClient);
    },
  });
}
