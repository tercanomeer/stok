import type {
  CashMovementType,
  ContactTransactionType,
  ContactType,
  PaymentMethod,
  PurchaseStatus,
} from './api-types';

/** Ödeme yöntemi etiketleri — cari, alış ve finans ekranlarında aynı sözlük. */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Nakit',
  CARD: 'Kart',
  CREDIT: 'Veresiye',
  TRANSFER: 'Havale/EFT',
};

export const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  CUSTOMER: 'Müşteri',
  SUPPLIER: 'Tedarikçi',
  BOTH: 'Müşteri + Tedarikçi',
};

export const TRANSACTION_TYPE_LABELS: Record<ContactTransactionType, string> = {
  DEBIT: 'Borç',
  CREDIT: 'Alacak',
};

export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = {
  COMPLETED: 'Tamamlandı',
  CANCELLED: 'İptal',
};

export const CASH_MOVEMENT_LABELS: Record<CashMovementType, string> = {
  OPENING: 'Açılış',
  SALE: 'Satış',
  SALE_REFUND: 'Satış iadesi',
  COLLECTION: 'Tahsilat',
  PAYMENT: 'Ödeme',
  EXPENSE: 'Gider',
  DEPOSIT: 'Kasaya giriş',
  WITHDRAWAL: 'Kasadan çıkış',
  CLOSING: 'Kapanış',
};
