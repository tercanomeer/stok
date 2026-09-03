'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { apiDelete, apiDownload, apiGet, apiPatch, apiPost } from '../lib/api';
import type {
  AgingBuckets,
  Contact,
  ContactAgingReport,
  ContactStatement,
  ContactType,
  Paginated,
  PaymentMethod,
} from '../lib/api-types';
import { listParamsToApiQuery, type ListParams } from '../lib/list-params';

export function useContacts(params: ListParams): UseQueryResult<Paginated<Contact>> {
  const query = listParamsToApiQuery(params);
  return useQuery({
    queryKey: ['contacts', query],
    queryFn: () => apiGet<Paginated<Contact>>('/contacts', { params: query }),
    placeholderData: (previous) => previous,
  });
}

export function useContact(id: string | undefined): UseQueryResult<Contact> {
  return useQuery({
    queryKey: ['contacts', 'detail', id],
    queryFn: () => apiGet<Contact>(`/contacts/${id ?? ''}`),
    enabled: Boolean(id),
  });
}

export interface StatementRange {
  from: string;
  to: string;
}

export function useStatement(
  id: string | undefined,
  range: StatementRange,
): UseQueryResult<ContactStatement> {
  return useQuery({
    queryKey: ['contacts', 'statement', id, range.from, range.to],
    queryFn: () => apiGet<ContactStatement>(`/contacts/${id ?? ''}/statement`, { params: range }),
    enabled: Boolean(id),
  });
}

export function useAging(id: string | undefined): UseQueryResult<AgingBuckets> {
  return useQuery({
    queryKey: ['contacts', 'aging', id],
    queryFn: () => apiGet<AgingBuckets>(`/contacts/${id ?? ''}/aging`),
    enabled: Boolean(id),
  });
}

/** Veresiye defteri — bakiyesi olan carilerin kova dağılımı (tek sorgu, N+1 yok). */
export function useContactAging(enabled = true): UseQueryResult<ContactAgingReport> {
  return useQuery({
    queryKey: ['reports', 'contact-aging'],
    queryFn: () => apiGet<ContactAgingReport>('/reports/contact-aging'),
    enabled,
  });
}

export interface ContactPayload {
  type: ContactType;
  name: string;
  code?: string | undefined;
  taxNumber?: string | undefined;
  taxOffice?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
  address?: string | undefined;
  creditLimit?: string | undefined;
  note?: string | undefined;
}

export interface SaveContactArgs {
  /** Verilirse güncelleme, yoksa oluşturma. */
  id?: string;
  payload: ContactPayload;
}

export function useSaveContact(): UseMutationResult<Contact, Error, SaveContactArgs> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: SaveContactArgs) =>
      id ? apiPatch<Contact>(`/contacts/${id}`, payload) : apiPost<Contact>('/contacts', payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export function useDeleteContact(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/contacts/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export interface PaymentPayload {
  contactId: string;
  /** collect = müşteriden tahsilat, pay = tedarikçiye ödeme. */
  direction: 'collect' | 'pay';
  amount: string;
  method: Exclude<PaymentMethod, 'CREDIT'>;
  description?: string;
}

/**
 * Tahsilat / ödeme. Bakiye, ekstre ve yaşlandırma aynı hareketten türediği için
 * üçünün cache'i birden geçersiz kılınır — ekranlar birbiriyle tutarlı kalır.
 */
export function useRecordPayment(): UseMutationResult<unknown, Error, PaymentPayload> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: PaymentPayload) => apiPost<unknown>('/contacts/payments', payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
      void queryClient.invalidateQueries({ queryKey: ['reports', 'contact-aging'] });
    },
  });
}

/** Ekstre Excel'i indirir (Authorization başlığıyla). */
export async function downloadStatement(
  contactId: string,
  contactName: string,
  range: StatementRange,
): Promise<void> {
  const query = new URLSearchParams({ from: range.from, to: range.to }).toString();
  await apiDownload(`/contacts/${contactId}/statement.xlsx?${query}`, `ekstre-${contactName}.xlsx`);
}
