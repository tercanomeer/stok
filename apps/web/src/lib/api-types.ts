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

// --- Katalog (kategori / marka / birim) ---

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

export interface Brand {
  id: string;
  name: string;
}

export interface Unit {
  id: string;
  name: string;
  abbreviation: string;
  allowsDecimal: boolean;
}

// --- Ürün ---

export interface ProductBarcode {
  id: string;
  value: string;
  isPrimary: boolean;
}

/** `/products` PRODUCT_SELECT çıktısı. Para ve miktar STRING. */
export interface Product {
  id: string;
  name: string;
  code: string | null;
  categoryId: string | null;
  brandId: string | null;
  unitId: string;
  salePrice: string;
  vatRate: number;
  stockQuantity: string;
  criticalLevel: string;
  trackStock: boolean;
  isWeighed: boolean;
  isActive: boolean;
  imageUrl: string | null;
  createdAt: string;
  barcodes: ProductBarcode[];
}

export type StockFilter = 'all' | 'active' | 'low' | 'out';

export interface BulkPricePreviewItem {
  id: string;
  name: string;
  oldPrice: string;
  newPrice: string;
}

/** `preview: true` önizleme döner, `false` yalnız etkilenen adedi. */
export interface BulkPriceResult {
  preview: boolean;
  affected: number;
  items?: BulkPricePreviewItem[];
}

export interface LabelResult {
  url: string;
  count: number;
}

// --- Excel import ---

export type ImportJobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface ImportRowError {
  row: number;
  message: string;
  field?: string;
}

export interface ImportJob {
  id: string;
  type: string;
  status: ImportJobStatus;
  fileName: string | null;
  totalRows: number;
  processedRows: number;
  createdCount: number;
  errorCount: number;
  errors: ImportRowError[] | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

// --- Stok ---

export type StockMovementType =
  | 'SALE'
  | 'SALE_RETURN'
  | 'PURCHASE'
  | 'PURCHASE_RETURN'
  | 'COUNT_ADJUSTMENT'
  | 'WASTE'
  | 'MANUAL_ADJUSTMENT';

export interface StockMovement {
  id: string;
  productId: string;
  type: StockMovementType;
  /** İşaretli miktar: giriş pozitif, çıkış negatif. */
  quantity: string;
  balanceAfter: string;
  reason: string | null;
  createdAt: string;
  product: { name: string };
}

export interface LowStockRow {
  id: string;
  name: string;
  stockQuantity: string;
  criticalLevel: string;
}

export type StockCountStatus = 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface StockCountListItem {
  id: string;
  code: string;
  status: StockCountStatus;
  note: string | null;
  startedAt: string;
  completedAt: string | null;
  _count: { items: number };
}

export interface StockCountItem {
  id: string;
  productId: string;
  expectedQuantity: string;
  countedQuantity: string;
  product: { name: string };
}

export interface StockCountDetail {
  id: string;
  code: string;
  status: StockCountStatus;
  note: string | null;
  startedAt: string;
  completedAt: string | null;
  items: StockCountItem[];
}

export interface StockCountCompleteResult {
  countId: string;
  items: number;
  adjustments: number;
}
