/**
 * `tenantId` taşıyan modeller.
 *
 * Prisma 7 çalışma zamanında `Prisma.dmmf` sunmuyor, bu yüzden liste elle tutuluyor.
 * `tenant-scoped.spec.ts` bu listeyi schema.prisma ile karşılaştırıyor: yeni bir
 * tenant'a bağlı model eklenip buraya yazılmazsa test kırmızı yanar.
 *
 * Kullanım yerleri: Prisma tenant extension'ı (otomatik tenantId filtresi) ve
 * row-level security politikalarının kapsam kontrolü.
 */
export const TENANT_SCOPED_MODELS = [
  'AuditLog',
  'Barcode',
  'Brand',
  'CashMovement',
  'CashSession',
  'Category',
  'Contact',
  'ContactTransaction',
  'EInvoice',
  'Expense',
  'ExpenseCategory',
  'ExportJob',
  'ImportJob',
  'Income',
  'Product',
  'ProductPriceHistory',
  'Purchase',
  'PurchaseItem',
  'ReceiptSequence',
  'RefreshToken',
  'Register',
  'Role',
  'Sale',
  'SaleItem',
  'SalePayment',
  'SaleReturn',
  'SaleReturnItem',
  'StockCount',
  'StockCountItem',
  'StockMovement',
  'TenantSettings',
  'Unit',
  'User',
] as const;

export type TenantScopedModel = (typeof TENANT_SCOPED_MODELS)[number];
