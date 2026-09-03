'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { apiGet } from '../lib/api';
import type { DashboardSummary, Paginated, SaleListItem, SalesSeries } from '../lib/api-types';

/** Bugünün yerel gün sınırları, ISO (UTC) olarak. */
export function todayRange(): { from: string; to: string } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString() };
}

export function useDashboardSummary(enabled: boolean): UseQueryResult<DashboardSummary> {
  const range = todayRange();
  return useQuery({
    queryKey: ['dashboard', 'summary', range.from, range.to],
    queryFn: () => apiGet<DashboardSummary>('/reports/dashboard', { params: range }),
    enabled,
  });
}

export function useHourlySales(enabled: boolean): UseQueryResult<SalesSeries> {
  const range = todayRange();
  return useQuery({
    queryKey: ['dashboard', 'hourly', range.from, range.to],
    queryFn: () =>
      apiGet<SalesSeries>('/reports/sales', { params: { ...range, granularity: 'hour' } }),
    enabled,
  });
}

export function useRecentSales(enabled: boolean): UseQueryResult<Paginated<SaleListItem>> {
  return useQuery({
    queryKey: ['dashboard', 'recent-sales'],
    queryFn: () =>
      apiGet<Paginated<SaleListItem>>('/sales', { params: { limit: 8, sort: 'soldAt:desc' } }),
    enabled,
  });
}
