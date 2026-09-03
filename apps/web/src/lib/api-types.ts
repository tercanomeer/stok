/**
 * Web'in tükettiği API veri tipleri. Backend sözleşmesiyle elle hizalı
 * (auth.service AuthenticatedUser, reports/sales dönüşleri). Para/miktar STRING.
 */

export interface ApiUser {
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  permissions: string[];
  roles: string[];
}

/** Login/register/refresh dönüşü (zarf açıldıktan sonra). */
export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: ApiUser;
}

export interface DashboardSummary {
  period: { from: string; to: string };
  salesTotal: string;
  salesCount: number;
  lowStockCount: number;
  openSessions: number;
  openCashExpected: string;
  /** Yalnız REPORT_PROFIT_VIEW yetkisiyle döner. */
  profit?: string;
}

export interface SalesSeriesPoint {
  date: string;
  total: string;
  count: number;
}

export interface SalesSeries {
  period: { from: string; to: string };
  granularity: 'hour' | 'day' | 'week' | 'month';
  series: SalesSeriesPoint[];
}

export type SaleStatus = 'COMPLETED' | 'PARKED' | 'CANCELLED' | 'PARTIALLY_RETURNED' | 'RETURNED';

export interface SaleListItem {
  id: string;
  receiptNo: string;
  status: SaleStatus;
  grandTotal: string;
  soldAt: string;
  contact: { id: string; name: string } | null;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}
