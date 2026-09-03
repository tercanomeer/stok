'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { apiDelete, apiGet, apiPatch, apiPost, apiUpload } from '../lib/api';
import type { BulkPriceResult, ImportJob, LabelResult, Paginated, Product } from '../lib/api-types';
import { listParamsToApiQuery, type ListParams } from '../lib/list-params';

export function useProducts(params: ListParams): UseQueryResult<Paginated<Product>> {
  const query = listParamsToApiQuery(params);
  return useQuery({
    queryKey: ['products', query],
    queryFn: () => apiGet<Paginated<Product>>('/products', { params: query }),
    // Sayfa değişince tablo boşalmasın: yeni sayfa gelene kadar eskisi durur.
    placeholderData: (previous) => previous,
  });
}

export function useProduct(id: string | undefined): UseQueryResult<Product> {
  return useQuery({
    queryKey: ['products', 'detail', id],
    queryFn: () => apiGet<Product>(`/products/${id ?? ''}`),
    enabled: Boolean(id),
  });
}

export interface ProductPayload {
  name: string;
  code?: string | undefined;
  categoryId?: string | undefined;
  brandId?: string | undefined;
  unitId: string;
  salePrice: string;
  vatRate: number;
  criticalLevel?: string | undefined;
  trackStock?: boolean;
  isWeighed?: boolean;
  description?: string | undefined;
  /** Yalnız oluşturmada; düzenlemede barkodlar ayrı uçlarla yönetilir. */
  barcodes?: string[];
}

export function useCreateProduct(): UseMutationResult<Product, Error, ProductPayload> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ProductPayload) => apiPost<Product>('/products', payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export interface UpdateProductArgs {
  id: string;
  payload: Partial<ProductPayload> & { isActive?: boolean };
}

export function useUpdateProduct(): UseMutationResult<Product, Error, UpdateProductArgs> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: UpdateProductArgs) =>
      apiPatch<Product>(`/products/${id}`, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useDeleteProduct(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/products/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export interface AddBarcodeArgs {
  productId: string;
  value: string;
  isPrimary?: boolean;
}

export function useAddBarcode(): UseMutationResult<unknown, Error, AddBarcodeArgs> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, value, isPrimary }: AddBarcodeArgs) =>
      apiPost<unknown>(`/products/${productId}/barcodes`, { value, isPrimary }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export interface RemoveBarcodeArgs {
  productId: string;
  barcodeId: string;
}

export function useRemoveBarcode(): UseMutationResult<void, Error, RemoveBarcodeArgs> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, barcodeId }: RemoveBarcodeArgs) =>
      apiDelete(`/products/${productId}/barcodes/${barcodeId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export interface UploadImageArgs {
  productId: string;
  file: File;
}

export function useUploadProductImage(): UseMutationResult<Product, Error, UploadImageArgs> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, file }: UploadImageArgs) =>
      apiUpload<Product>(`/products/${productId}/image`, file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export interface BulkPricePayload {
  productIds?: string[];
  categoryId?: string;
  brandId?: string;
  mode: 'percent' | 'amount';
  /** Yüzde modunda oran ("10" = %10 zam), tutar modunda TL. String — float yasak. */
  value: string;
  preview?: boolean;
}

/**
 * Toplu fiyat. `preview: true` fiyatları DEĞİŞTİRMEZ, yalnız etkilenen listeyi döner;
 * uygulama adımı ayrı bir çağrıdır. Önizleme cache'i geçersiz kılmaz.
 */
export function useBulkPrice(): UseMutationResult<BulkPriceResult, Error, BulkPricePayload> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: BulkPricePayload) =>
      apiPost<BulkPriceResult>('/products/bulk-price', payload),
    onSuccess: (result) => {
      if (!result.preview) void queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useGenerateLabels(): UseMutationResult<LabelResult, Error, string[]> {
  return useMutation({
    mutationFn: (productIds: string[]) => apiPost<LabelResult>('/products/labels', { productIds }),
  });
}

export function useStartImport(): UseMutationResult<{ jobId: string }, Error, File> {
  return useMutation({
    mutationFn: (file: File) => apiUpload<{ jobId: string }>('/products/import', file),
  });
}

/**
 * İçe aktarma işi durumu. İş kuyrukta işlenirken 1 sn'de bir yoklanır;
 * bittiğinde (COMPLETED/FAILED) yoklama durur ve ürün listesi tazelenir.
 */
export function useImportJob(jobId: string | null): UseQueryResult<ImportJob> {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['import-job', jobId],
    queryFn: async () => {
      const job = await apiGet<ImportJob>(`/products/import/${jobId ?? ''}`);
      if (job.status === 'COMPLETED') {
        void queryClient.invalidateQueries({ queryKey: ['products'] });
      }
      return job;
    },
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'COMPLETED' || status === 'FAILED' ? false : 1000;
    },
  });
}

/** Barkod okutmada kullanılan hızlı arama — tam barkod eşleşmesi de bu uçtan gelir. */
export function useProductSearch(term: string): UseQueryResult<Paginated<Product>> {
  return useQuery({
    queryKey: ['products', 'search', term],
    queryFn: () => apiGet<Paginated<Product>>('/products', { params: { search: term, limit: 10 } }),
    enabled: term.trim().length > 0,
  });
}
