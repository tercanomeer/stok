'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiGet } from '../lib/api';
import type { CashSessionDetail, CashSessionListItem, Register } from '../lib/api-types';

/** Vardiya geçmişi. `status` verilmezse açık + kapalı hepsi döner. */
export function useCashSessions(
  status?: 'OPEN' | 'CLOSED',
  enabled = true,
): UseQueryResult<CashSessionListItem[]> {
  return useQuery({
    queryKey: ['cash-sessions', status ?? 'all'],
    queryFn: () =>
      apiGet<CashSessionListItem[]>('/cash-sessions', {
        ...(status ? { params: { status } } : {}),
      }),
    enabled,
  });
}

export function useCashSession(id: string | undefined): UseQueryResult<CashSessionDetail> {
  return useQuery({
    queryKey: ['cash-sessions', 'detail', id],
    queryFn: () => apiGet<CashSessionDetail>(`/cash-sessions/${id ?? ''}`),
    enabled: Boolean(id),
  });
}

export function useRegisters(enabled = true): UseQueryResult<Register[]> {
  return useQuery({
    queryKey: ['registers'],
    queryFn: () => apiGet<Register[]>('/registers'),
    staleTime: 5 * 60_000,
    enabled,
  });
}
