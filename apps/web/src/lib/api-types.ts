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

// --- Cari ---

export type ContactType = 'CUSTOMER' | 'SUPPLIER' | 'BOTH';
export type PaymentMethod = 'CASH' | 'CARD' | 'CREDIT' | 'TRANSFER';

/**
 * Bakiye konvansiyonu (backend `ContactService`): balance > 0 = cari BİZE borçlu,
 * balance < 0 = BİZ cariye borçluyuz. Ekranda bu işaret çevrilmez, etiketlenir.
 */
export interface Contact {
  id: string;
  type: ContactType;
  name: string;
  code: string | null;
  taxNumber: string | null;
  taxOffice: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  creditLimit: string;
  balance: string;
  isActive: boolean;
  createdAt: string;
}

export type ContactTransactionType = 'DEBIT' | 'CREDIT';

export interface ContactTransaction {
  id: string;
  type: ContactTransactionType;
  amount: string;
  balanceAfter: string;
  paymentMethod: PaymentMethod | null;
  description: string | null;
  createdAt: string;
}

export interface ContactStatement {
  contact: { id: string; name: string; balance: string };
  period: { from: string; to: string };
  opening: string;
  closing: string;
  movements: ContactTransaction[];
}

export interface AgingBuckets {
  current: string;
  days31to60: string;
  days61to90: string;
  over90: string;
  total: string;
}

export interface ContactAgingRow extends AgingBuckets {
  contactId: string;
  name: string;
}

export interface ContactAgingReport {
  contacts: ContactAgingRow[];
  totals: Omit<AgingBuckets, 'total'>;
}

// --- Alış faturası ---

export type PurchaseStatus = 'COMPLETED' | 'CANCELLED';

export interface PurchaseListItem {
  id: string;
  invoiceNo: string | null;
  status: PurchaseStatus;
  invoiceDate: string;
  grandTotal: string;
  createdAt: string;
  contact: { id: string; name: string };
}

export interface PurchaseItemDetail {
  id: string;
  productId: string;
  quantity: string;
  /** KDV HARİÇ birim alış fiyatı. */
  unitPrice: string;
  discountRate: string;
  vatRate: number;
  /** İskonto sonrası satır matrahı (KDV hariç). */
  lineTotal: string;
  vatAmount: string;
  product: { name: string };
}

export interface PurchaseDetail {
  id: string;
  invoiceNo: string | null;
  status: PurchaseStatus;
  invoiceDate: string;
  subtotal: string;
  discountTotal: string;
  vatTotal: string;
  grandTotal: string;
  note: string | null;
  createdAt: string;
  cancelledAt: string | null;
  contact: { id: string; name: string };
  items: PurchaseItemDetail[];
}

// --- Finans ---

export interface ExpenseCategory {
  id: string;
  name: string;
  createdAt: string;
}

export interface Expense {
  id: string;
  amount: string;
  paymentMethod: PaymentMethod;
  description: string;
  expenseDate: string;
  documentNo: string | null;
  category: { id: string; name: string } | null;
}

export interface Income {
  id: string;
  amount: string;
  paymentMethod: PaymentMethod;
  description: string;
  incomeDate: string;
  documentNo: string | null;
}

// --- Kasa / vardiya ---

export interface Register {
  id: string;
  name: string;
  isActive: boolean;
}

export type CashSessionStatus = 'OPEN' | 'CLOSED';

export interface CashSessionListItem {
  id: string;
  registerId: string;
  userId: string;
  status: CashSessionStatus;
  openingAmount: string;
  closingAmount: string | null;
  differenceAmount: string | null;
  openedAt: string;
  closedAt: string | null;
  register: { name: string };
}

export type CashMovementType =
  | 'OPENING'
  | 'SALE'
  | 'SALE_REFUND'
  | 'COLLECTION'
  | 'PAYMENT'
  | 'EXPENSE'
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'CLOSING';

/** Tutar İŞARETLİ: giriş pozitif, çıkış negatif (beklenen kasa = hareketlerin toplamı). */
export interface CashMovement {
  id: string;
  type: CashMovementType;
  amount: string;
  description: string | null;
  createdAt: string;
}

export interface CashSessionDetail {
  id: string;
  registerId: string;
  userId: string;
  status: CashSessionStatus;
  openingAmount: string;
  closingAmount: string | null;
  expectedAmount: string | null;
  differenceAmount: string | null;
  openedAt: string;
  closedAt: string | null;
  note: string | null;
  movements: CashMovement[];
}
