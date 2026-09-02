/**
 * İzin kataloğu — `resource.action` biçiminde string sabitler.
 *
 * Tek doğruluk kaynağı burasıdır: `db:seed` bu listeden `Permission` tablosunu doldurur,
 * `@Permissions()` decorator'ı bu sabitleri kullanır, rol izin matrisi ekranı bunları listeler.
 * Yeni izin eklenirken önce buraya yazılır, sonra seed yeniden çalıştırılır.
 */
export const PERMISSIONS = {
  // --- Ürün & katalog ---
  PRODUCT_VIEW: 'product.view',
  PRODUCT_MANAGE: 'product.manage',
  PRODUCT_DELETE: 'product.delete',
  PRODUCT_IMPORT: 'product.import',
  PRODUCT_PRICE_BULK_UPDATE: 'product.price.bulk-update',
  PRODUCT_COST_VIEW: 'product.cost.view',
  CATALOG_MANAGE: 'catalog.manage',

  // --- Stok ---
  STOCK_VIEW: 'stock.view',
  STOCK_COUNT: 'stock.count',
  STOCK_WASTE: 'stock.waste',
  STOCK_ADJUST: 'stock.adjust',

  // --- Satış ---
  SALE_CREATE: 'sale.create',
  SALE_VIEW: 'sale.view',
  SALE_CANCEL: 'sale.cancel',
  SALE_RETURN: 'sale.return',
  SALE_DISCOUNT_HIGH: 'sale.discount.high',
  SALE_CREDIT_OVER_LIMIT: 'sale.credit.over-limit',

  // --- Kasa & vardiya ---
  CASH_SESSION_OPEN: 'cash-session.open',
  CASH_SESSION_CLOSE: 'cash-session.close',
  CASH_SESSION_VIEW_ALL: 'cash-session.view-all',
  CASH_MOVEMENT_MANAGE: 'cash-movement.manage',
  REGISTER_MANAGE: 'register.manage',

  // --- Cari ---
  CONTACT_VIEW: 'contact.view',
  CONTACT_MANAGE: 'contact.manage',
  CONTACT_TRANSACTION_MANAGE: 'contact-transaction.manage',

  // --- Alış ---
  PURCHASE_VIEW: 'purchase.view',
  PURCHASE_MANAGE: 'purchase.manage',
  PURCHASE_CANCEL: 'purchase.cancel',

  // --- Finans ---
  EXPENSE_VIEW: 'expense.view',
  EXPENSE_MANAGE: 'expense.manage',
  INCOME_VIEW: 'income.view',
  INCOME_MANAGE: 'income.manage',

  // --- Raporlar ---
  REPORT_SALES_VIEW: 'report.sales.view',
  REPORT_PROFIT_VIEW: 'report.profit.view',
  REPORT_STAFF_VIEW: 'report.staff.view',
  REPORT_STOCK_VIEW: 'report.stock.view',
  REPORT_EXPORT: 'report.export',

  // --- Yasal ---
  EINVOICE_VIEW: 'einvoice.view',
  EINVOICE_SEND: 'einvoice.send',

  // --- Yönetim ---
  USER_VIEW: 'user.view',
  USER_MANAGE: 'user.manage',
  ROLE_MANAGE: 'role.manage',
  SETTINGS_MANAGE: 'settings.manage',
  AUDIT_LOG_VIEW: 'audit-log.view',
  SUBSCRIPTION_MANAGE: 'subscription.manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: readonly Permission[] = Object.values(PERMISSIONS);

/** Sistem rolleri — 01-proje.md "Sistem rolleri". Tenant kaydında bu tanımdan kopyalanır. */
export const SYSTEM_ROLES = {
  OWNER: 'PATRON',
  MANAGER: 'YONETICI',
  CASHIER: 'KASIYER',
} as const;

export type SystemRole = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

/**
 * Rol → izin kümesi.
 * Patron her şeyi görür. Maliyet, kâr ve personel performansı yalnız Patron'da.
 * Kasiyer maliyet/kâr görmez, ürün silemez.
 */
export const SYSTEM_ROLE_PERMISSIONS: Readonly<Record<SystemRole, readonly Permission[]>> = {
  [SYSTEM_ROLES.OWNER]: ALL_PERMISSIONS,

  [SYSTEM_ROLES.MANAGER]: [
    PERMISSIONS.PRODUCT_VIEW,
    PERMISSIONS.PRODUCT_MANAGE,
    PERMISSIONS.PRODUCT_DELETE,
    PERMISSIONS.PRODUCT_IMPORT,
    PERMISSIONS.PRODUCT_PRICE_BULK_UPDATE,
    PERMISSIONS.PRODUCT_COST_VIEW,
    PERMISSIONS.CATALOG_MANAGE,
    PERMISSIONS.STOCK_VIEW,
    PERMISSIONS.STOCK_COUNT,
    PERMISSIONS.STOCK_WASTE,
    PERMISSIONS.STOCK_ADJUST,
    PERMISSIONS.SALE_CREATE,
    PERMISSIONS.SALE_VIEW,
    PERMISSIONS.SALE_CANCEL,
    PERMISSIONS.SALE_RETURN,
    PERMISSIONS.SALE_DISCOUNT_HIGH,
    PERMISSIONS.SALE_CREDIT_OVER_LIMIT,
    PERMISSIONS.CASH_SESSION_OPEN,
    PERMISSIONS.CASH_SESSION_CLOSE,
    PERMISSIONS.CASH_SESSION_VIEW_ALL,
    PERMISSIONS.CASH_MOVEMENT_MANAGE,
    PERMISSIONS.REGISTER_MANAGE,
    PERMISSIONS.CONTACT_VIEW,
    PERMISSIONS.CONTACT_MANAGE,
    PERMISSIONS.CONTACT_TRANSACTION_MANAGE,
    PERMISSIONS.PURCHASE_VIEW,
    PERMISSIONS.PURCHASE_MANAGE,
    PERMISSIONS.PURCHASE_CANCEL,
    PERMISSIONS.EXPENSE_VIEW,
    PERMISSIONS.EXPENSE_MANAGE,
    PERMISSIONS.INCOME_VIEW,
    PERMISSIONS.INCOME_MANAGE,
    PERMISSIONS.REPORT_SALES_VIEW,
    PERMISSIONS.REPORT_STOCK_VIEW,
    PERMISSIONS.REPORT_EXPORT,
    PERMISSIONS.EINVOICE_VIEW,
    PERMISSIONS.EINVOICE_SEND,
  ],

  [SYSTEM_ROLES.CASHIER]: [
    PERMISSIONS.PRODUCT_VIEW,
    PERMISSIONS.STOCK_VIEW,
    PERMISSIONS.SALE_CREATE,
    PERMISSIONS.SALE_VIEW,
    PERMISSIONS.SALE_CANCEL,
    PERMISSIONS.CASH_SESSION_OPEN,
    PERMISSIONS.CASH_SESSION_CLOSE,
    PERMISSIONS.CONTACT_VIEW,
  ],
};
