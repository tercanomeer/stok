'use client';

import {
  useMutation,
  useQuery,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { apiGet, apiPost } from '../lib/api';
import type {
  CashierReport,
  DailyShiftReport,
  ExportJob,
  ExportReportKey,
  HourlyDensityReport,
  PaymentDistributionReport,
  ProfitReport,
  SalesSeries,
  StockValueReport,
  TopProductsReport,
} from '../lib/api-types';

export interface ReportRange {
  from: string;
  to: string;
}

type Granularity = 'hour' | 'day' | 'week' | 'month';

export function useSalesReport(
  range: ReportRange,
  granularity: Granularity,
  enabled = true,
): UseQueryResult<SalesSeries> {
  return useQuery({
    queryKey: ['reports', 'sales', range.from, range.to, granularity],
    queryFn: () => apiGet<SalesSeries>('/reports/sales', { params: { ...range, granularity } }),
    enabled,
  });
}

export function useProfitReport(
  range: ReportRange,
  granularity: Granularity,
  enabled = true,
): UseQueryResult<ProfitReport> {
  return useQuery({
    queryKey: ['reports', 'profit', range.from, range.to, granularity],
    queryFn: () => apiGet<ProfitReport>('/reports/profit', { params: { ...range, granularity } }),
    enabled,
  });
}

export function useTopProducts(
  range: ReportRange,
  enabled = true,
): UseQueryResult<TopProductsReport> {
  return useQuery({
    queryKey: ['reports', 'top-products', range.from, range.to],
    queryFn: () =>
      apiGet<TopProductsReport>('/reports/top-products', { params: { ...range, limit: 10 } }),
    enabled,
  });
}

export function useCashierPerformance(
  range: ReportRange,
  enabled = true,
): UseQueryResult<CashierReport> {
  return useQuery({
    queryKey: ['reports', 'cashier-performance', range.from, range.to],
    queryFn: () => apiGet<CashierReport>('/reports/cashier-performance', { params: range }),
    enabled,
  });
}

export function useHourlyDensity(
  range: ReportRange,
  enabled = true,
): UseQueryResult<HourlyDensityReport> {
  return useQuery({
    queryKey: ['reports', 'hourly-density', range.from, range.to],
    queryFn: () => apiGet<HourlyDensityReport>('/reports/hourly-density', { params: range }),
    enabled,
  });
}

export function useStockValue(enabled = true): UseQueryResult<StockValueReport> {
  return useQuery({
    queryKey: ['reports', 'stock-value'],
    queryFn: () => apiGet<StockValueReport>('/reports/stock-value'),
    enabled,
  });
}

export function usePaymentDistribution(
  range: ReportRange,
  enabled = true,
): UseQueryResult<PaymentDistributionReport> {
  return useQuery({
    queryKey: ['reports', 'payment-distribution', range.from, range.to],
    queryFn: () =>
      apiGet<PaymentDistributionReport>('/reports/payment-distribution', { params: range }),
    enabled,
  });
}

export function useDailyShift(date: string, enabled = true): UseQueryResult<DailyShiftReport> {
  return useQuery({
    queryKey: ['reports', 'daily-shift', date],
    queryFn: () => apiGet<DailyShiftReport>('/reports/daily-shift', { params: { date } }),
    enabled,
  });
}

export interface ExportPayload {
  report: ExportReportKey;
  format: 'XLSX' | 'PDF';
  from: string;
  to: string;
  granularity?: Granularity;
  limit?: number;
}

export function useCreateExport(): UseMutationResult<{ jobId: string }, Error, ExportPayload> {
  return useMutation({
    mutationFn: (payload: ExportPayload) => apiPost<{ jobId: string }>('/exports', payload),
  });
}

/**
 * Export işi kuyrukta hazırlanır; bitene kadar 1 sn'de bir yoklanır.
 * COMPLETED/FAILED'da yoklama durur — açık sekmede sonsuza kadar istek atılmaz.
 */
export function useExportJob(jobId: string | null): UseQueryResult<ExportJob> {
  return useQuery({
    queryKey: ['exports', jobId],
    queryFn: () => apiGet<ExportJob>(`/exports/${jobId ?? ''}`),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'COMPLETED' || status === 'FAILED' ? false : 1000;
    },
  });
}
