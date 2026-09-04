import { randomUUID } from 'node:crypto';

import { calculateSaleBreakdown } from '@stokk/pos-core';

import type { PosDatabase } from './database';
import { enqueue } from './queue-repo';

export type PaymentMethod = 'CASH' | 'CARD' | 'CREDIT' | 'TRANSFER';

export interface LocalSaleLineInput {
  productId: string;
  /** Fişte gösterilecek ad — ürün sonradan silinse bile yerel kayıt okunabilsin. */
  name: string;
  quantity: string;
  /** Birim satış fiyatı — KDV DAHİL (SaleItem sözleşmesi). */
  unitPrice: string;
  vatRate: number;
  discountRate?: string;
  note?: string;
}

export interface LocalPaymentInput {
  method: PaymentMethod;
  amount: string;
  receivedAmount?: string;
  reference?: string;
}

export interface LocalSaleInput {
  cashSessionId: string;
  contactId?: string;
  documentDiscountRate?: string;
  note?: string;
  /** Satışın POS'ta gerçekleştiği an (ISO, UTC). */
  soldAt: string;
  lines: LocalSaleLineInput[];
  payments: LocalPaymentInput[];
}

export interface LocalSaleRecord {
  id: string;
  status: 'PENDING' | 'SYNCED' | 'FAILED';
  grandTotal: string;
  receiptNo: string | null;
  serverSaleId: string | null;
  soldAt: string;
}

/**
 * Offline satışı yerel depoya yazar ve gönderim kuyruğuna alır — TEK transaction.
 *
 * Satış ile kuyruk kaydı aynı transaction'da olmak zorunda: satış yazılıp kuyruk
 * kaydı düşerse satış sunucuya asla gitmez, tersi olursa var olmayan satış gönderilir.
 *
 * `clientSaleId` = yerel satışın kimliği. Sunucuda benzersiz olduğu için aynı satış
 * iki kez gönderilse bile ikinci kayıt AÇILMAZ (idempotent push).
 *
 * Tutar `@stokk/pos-core` ile hesaplanır — POS'ta ikinci bir formül yazılmaz (CLAUDE.md).
 */
export function saveLocalSale(
  db: PosDatabase,
  input: LocalSaleInput,
  now: Date,
  clientSaleId: string = randomUUID(),
): LocalSaleRecord {
  const breakdown = calculateSaleBreakdown({
    lines: input.lines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      vatRate: line.vatRate,
      ...(line.discountRate === undefined ? {} : { discountRate: line.discountRate }),
    })),
    ...(input.documentDiscountRate === undefined
      ? {}
      : { documentDiscountRate: input.documentDiscountRate }),
  });

  const iso = now.toISOString();
  const payload = {
    clientSaleId,
    cashSessionId: input.cashSessionId,
    ...(input.contactId === undefined ? {} : { contactId: input.contactId }),
    ...(input.documentDiscountRate === undefined
      ? {}
      : { documentDiscountRate: input.documentDiscountRate }),
    ...(input.note === undefined ? {} : { note: input.note }),
    soldAt: input.soldAt,
    lines: input.lines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      vatRate: line.vatRate,
      ...(line.discountRate === undefined ? {} : { discountRate: line.discountRate }),
      ...(line.note === undefined ? {} : { note: line.note }),
    })),
    payments: input.payments.map((payment) => ({
      method: payment.method,
      amount: payment.amount,
      ...(payment.receivedAmount === undefined ? {} : { receivedAmount: payment.receivedAmount }),
      ...(payment.reference === undefined ? {} : { reference: payment.reference }),
    })),
  };

  const run = db.transaction(() => {
    db.prepare(
      `INSERT INTO local_sales
         (id, cash_session_id, contact_id, document_discount_rate, note, sold_at, grand_total, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
    ).run(
      clientSaleId,
      input.cashSessionId,
      input.contactId ?? null,
      input.documentDiscountRate ?? null,
      input.note ?? null,
      input.soldAt,
      breakdown.totals.grandTotal,
      iso,
    );

    const insertItem = db.prepare(
      `INSERT INTO local_sale_items
         (id, sale_id, product_id, name, quantity, unit_price, vat_rate, discount_rate, line_total, note, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    input.lines.forEach((line, index) => {
      const computed = breakdown.lines[index];
      insertItem.run(
        randomUUID(),
        clientSaleId,
        line.productId,
        line.name,
        line.quantity,
        line.unitPrice,
        line.vatRate,
        line.discountRate ?? null,
        computed?.lineTotal ?? '0.00',
        line.note ?? null,
        index,
      );
    });

    const insertPayment = db.prepare(
      `INSERT INTO local_payments (id, sale_id, method, amount, received_amount, reference)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const payment of input.payments) {
      insertPayment.run(
        randomUUID(),
        clientSaleId,
        payment.method,
        payment.amount,
        payment.receivedAmount ?? null,
        payment.reference ?? null,
      );
    }

    enqueue(db, { entity: 'sale', entityId: clientSaleId, payload, now });
  });

  run();

  return {
    id: clientSaleId,
    status: 'PENDING',
    grandTotal: breakdown.totals.grandTotal,
    receiptNo: null,
    serverSaleId: null,
    soldAt: input.soldAt,
  };
}

/** Sunucu satışı kabul etti — gerçek fiş numarası yerel kayda yazılır. */
export function markSaleSynced(
  db: PosDatabase,
  clientSaleId: string,
  server: { saleId?: string; receiptNo?: string },
): void {
  db.prepare(
    `UPDATE local_sales SET status = 'SYNCED', server_sale_id = ?, receipt_no = ? WHERE id = ?`,
  ).run(server.saleId ?? null, server.receiptNo ?? null, clientSaleId);
}

export function markSaleFailed(db: PosDatabase, clientSaleId: string): void {
  db.prepare(`UPDATE local_sales SET status = 'FAILED' WHERE id = ?`).run(clientSaleId);
}

export function findLocalSale(db: PosDatabase, clientSaleId: string): LocalSaleRecord | null {
  const row = db
    .prepare(
      `SELECT id, status, grand_total AS grandTotal, receipt_no AS receiptNo,
              server_sale_id AS serverSaleId, sold_at AS soldAt
         FROM local_sales WHERE id = ?`,
    )
    .get(clientSaleId) as LocalSaleRecord | undefined;
  return row ?? null;
}

/** Yerel satışın fişe dönüşmesi için gereken tam hâli. */
export interface StoredLocalSale {
  id: string;
  status: LocalSaleRecord['status'];
  receiptNo: string | null;
  soldAt: string;
  contactId: string | null;
  documentDiscountRate: string | null;
  lines: {
    productId: string;
    name: string;
    quantity: string;
    unitPrice: string;
    vatRate: number;
    discountRate: string | null;
    lineTotal: string;
    note: string | null;
  }[];
  payments: { method: PaymentMethod; amount: string; receivedAmount: string | null }[];
}

/**
 * Fiş yeniden basımı için satışı OLDUĞU GİBİ okur.
 *
 * Fiş, satışın yapıldığı andaki fiyatlarla basılmalı; ürün kataloğundan yeniden
 * hesaplamak, aradan geçen sürede değişmiş bir fiyatın kağıda yansıması demekti.
 * Bu yüzden satır tutarları da kayıttan okunuyor, yeniden hesaplanmıyor.
 */
export function readLocalSale(db: PosDatabase, clientSaleId: string): StoredLocalSale | null {
  const header = db
    .prepare(
      `SELECT id, status, receipt_no AS receiptNo, sold_at AS soldAt, contact_id AS contactId,
              document_discount_rate AS documentDiscountRate
         FROM local_sales WHERE id = ?`,
    )
    .get(clientSaleId) as Omit<StoredLocalSale, 'lines' | 'payments'> | undefined;
  if (!header) return null;

  const lines = db
    .prepare(
      `SELECT product_id AS productId, name, quantity, unit_price AS unitPrice,
              vat_rate AS vatRate, discount_rate AS discountRate,
              line_total AS lineTotal, note
         FROM local_sale_items WHERE sale_id = ? ORDER BY sort_order`,
    )
    .all(clientSaleId) as StoredLocalSale['lines'];

  const payments = db
    .prepare(
      `SELECT method, amount, received_amount AS receivedAmount
         FROM local_payments WHERE sale_id = ? ORDER BY rowid`,
    )
    .all(clientSaleId) as StoredLocalSale['payments'];

  return { ...header, lines, payments };
}
