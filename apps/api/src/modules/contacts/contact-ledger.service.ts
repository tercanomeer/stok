import { Injectable } from '@nestjs/common';
import exceljs from 'exceljs';

import { AuditAction, Prisma } from '@stokk/db';

import { ContactService } from './contact.service.js';
import type { PaymentInput, StatementInput } from './dto/contact.dto.js';
import { NotFoundError } from '../../common/errors/domain-error.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';

// exceljs CommonJS; ESM'de named import runtime'da patlıyor, default'tan alınıyor.
// eslint-disable-next-line import-x/no-named-as-default-member
const { Workbook } = exceljs;

const TX_LABEL: Record<string, string> = { DEBIT: 'Borç', CREDIT: 'Alacak' };

/** 0-30, 31-60, 61-90, 90+ gün yaşlandırma kovaları. */
export interface AgingBuckets {
  current: string; // 0-30
  days31to60: string;
  days61to90: string;
  over90: string;
  total: string;
}

@Injectable()
export class ContactLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly contacts: ContactService,
  ) {}

  /**
   * Tahsilat (müşteriden) veya ödeme (tedarikçiye) kaydı.
   * `direction: collect` = tahsilat (CREDIT, balance düşer), `pay` = ödeme (DEBIT, balance artar).
   * Kasa hareketine bağlanır (Faz 6 vardiya) — şimdilik cari hareket + audit.
   */
  async recordPayment(input: PaymentInput) {
    const type = input.direction === 'collect' ? 'CREDIT' : 'DEBIT';
    const transaction = await this.prisma.withTenant((tx, tenantId) =>
      this.contacts.applyTransaction(tx, tenantId, {
        contactId: input.contactId,
        type,
        amount: input.amount,
        paymentMethod: input.method,
        description: input.description ?? (input.direction === 'collect' ? 'Tahsilat' : 'Ödeme'),
      }),
    );
    await this.audit.record({
      action: AuditAction.CREATE,
      entity: 'ContactTransaction',
      entityId: transaction.id,
      changes: { direction: input.direction, amount: input.amount, method: input.method },
    });
    return transaction;
  }

  /**
   * Ekstre: tarih aralığı, açılış-kapanış bakiyesi, hareketler.
   * Açılış bakiyesi = aralıktan ÖNCEki son hareketin balanceAfter'ı (yoksa 0).
   * Kapanış = aralıktaki son hareketin balanceAfter'ı (yoksa açılış).
   */
  async statement(contactId: string, input: StatementInput) {
    return this.prisma.withTenant(async (tx) => {
      const contact = await tx.contact.findFirst({
        where: { id: contactId, deletedAt: null },
        select: { id: true, name: true, balance: true },
      });
      if (!contact) throw new NotFoundError('Cari bulunamadı.');

      const from = new Date(input.from);
      const to = new Date(input.to);

      const before = await tx.contactTransaction.findFirst({
        where: { contactId, createdAt: { lt: from } },
        orderBy: { createdAt: 'desc' },
        select: { balanceAfter: true },
      });
      const opening = before?.balanceAfter ?? new Prisma.Decimal(0);

      const movements = await tx.contactTransaction.findMany({
        where: { contactId, createdAt: { gte: from, lte: to } },
        select: {
          id: true,
          type: true,
          amount: true,
          balanceAfter: true,
          paymentMethod: true,
          description: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      const closing = movements.at(-1)?.balanceAfter ?? opening;

      // Ekstre toplamı ile cari bakiye tutarlılığı: kapanış (aralık = tüm zaman ise)
      // cari.balance ile eşit olmalı — doğrulama bloğu bunu kontrol ediyor.
      return {
        contact: { id: contact.id, name: contact.name, balance: contact.balance.toFixed(2) },
        period: { from: input.from, to: input.to },
        opening: opening.toFixed(2),
        closing: closing.toFixed(2),
        movements,
      };
    });
  }

  /**
   * Ekstre Excel çıktısı — açılış/kapanış bakiyesi + hareketler. PDF çıktısı
   * web tarafında ekstre JSON'undan basılır (yeni ağır bağımlılık eklenmez).
   */
  async statementExcel(contactId: string, input: StatementInput): Promise<Buffer> {
    const data = await this.statement(contactId, input);

    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('Ekstre');
    sheet.columns = [
      { header: 'Tarih', key: 'date', width: 20 },
      { header: 'Tür', key: 'type', width: 10 },
      { header: 'Açıklama', key: 'description', width: 32 },
      { header: 'Tutar', key: 'amount', width: 14 },
      { header: 'Bakiye', key: 'balance', width: 14 },
    ];
    sheet.addRow({ description: `${data.contact.name} — Ekstre` });
    sheet.addRow({ description: `Dönem: ${data.period.from} → ${data.period.to}` });
    sheet.addRow({ description: 'Açılış bakiyesi', balance: data.opening });
    for (const m of data.movements) {
      sheet.addRow({
        date: m.createdAt.toISOString(),
        type: TX_LABEL[m.type] ?? m.type,
        description: m.description ?? '',
        amount: m.amount.toFixed(2),
        balance: m.balanceAfter.toFixed(2),
      });
    }
    sheet.addRow({ description: 'Kapanış bakiyesi', balance: data.closing });

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Borç yaşlandırma (alacaklar için, balance > 0). FIFO: en eski DEBIT'ler en yeni
   * CREDIT'lerle kapatılır; kalan açık DEBIT'ler tarihine göre kovalanır.
   *
   * NOT (Faz 1 database-optimizer): ContactTransaction hangi borcun hangi tahsilatla
   * kapandığını modellemiyor; bu FIFO varsayımı gerçek eşleştirme değil, standart bir
   * yaşlandırma yaklaşımıdır.
   */
  async aging(contactId: string): Promise<AgingBuckets> {
    return this.prisma.withTenant(async (tx, tenantId) => {
      const contact = await tx.contact.findFirst({
        where: { id: contactId, deletedAt: null },
        select: { id: true },
      });
      if (!contact) throw new NotFoundError('Cari bulunamadı.');

      const txs = await tx.contactTransaction.findMany({
        // tenantId açıkça WHERE'de: (tenantId, contactId, createdAt) bileşik indeksi
        // kullanılsın (yoksa tüm tenant'ları kapsayan seq scan — database-optimizer bulgusu).
        where: { tenantId, contactId },
        select: { type: true, amount: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      });
      return bucketAging(txs);
    });
  }

  /**
   * Çok cari için TEK sorguda yaşlandırma (rapor için). Cari başına ayrı transaction açmak
   * (N+1) yerine tüm hareketleri tek findMany ile çeker, bellekte cari bazında kovalar
   * (performance-engineer/database-optimizer bulgusu).
   */
  async agingForContacts(contactIds: string[]): Promise<Map<string, AgingBuckets>> {
    if (contactIds.length === 0) return new Map();
    return this.prisma.withTenant(async (tx, tenantId) => {
      const rows = await tx.contactTransaction.findMany({
        where: { tenantId, contactId: { in: contactIds } },
        select: { contactId: true, type: true, amount: true, createdAt: true },
        orderBy: [{ contactId: 'asc' }, { createdAt: 'asc' }],
      });
      const grouped = new Map<
        string,
        { type: string; amount: Prisma.Decimal; createdAt: Date }[]
      >();
      for (const row of rows) {
        const list = grouped.get(row.contactId) ?? [];
        list.push({ type: row.type, amount: row.amount, createdAt: row.createdAt });
        grouped.set(row.contactId, list);
      }
      const result = new Map<string, AgingBuckets>();
      for (const contactId of contactIds) {
        result.set(contactId, bucketAging(grouped.get(contactId) ?? []));
      }
      return result;
    });
  }
}

function z(): Prisma.Decimal {
  return new Prisma.Decimal(0);
}

/**
 * FIFO yaşlandırma — saf fonksiyon (DB'siz). DEBIT açık kalem, CREDIT en eski kalemi kapatır;
 * açık borçları aşan tahsilat `carry`'de peşin ödeme olarak taşınır ve sonraki DEBIT'lerden
 * düşülür (yoksa fazla ödeme kaybolur, total gerçek bakiyeyi aşar — Faz 5 kararı).
 */
function bucketAging(
  txs: { type: string; amount: Prisma.Decimal; createdAt: Date }[],
): AgingBuckets {
  const openDebits: { amount: Prisma.Decimal; date: Date }[] = [];
  let carry = new Prisma.Decimal(0);
  for (const t of txs) {
    if (t.type === 'DEBIT') {
      let amount = t.amount;
      if (carry.greaterThan(0)) {
        const used = carry.lessThan(amount) ? carry : amount;
        carry = carry.minus(used);
        amount = amount.minus(used);
      }
      if (amount.greaterThan(0)) openDebits.push({ amount, date: t.createdAt });
    } else {
      let credit = t.amount;
      while (credit.greaterThan(0) && openDebits.length > 0) {
        const head = openDebits[0]!;
        if (head.amount.lessThanOrEqualTo(credit)) {
          credit = credit.minus(head.amount);
          openDebits.shift();
        } else {
          head.amount = head.amount.minus(credit);
          credit = new Prisma.Decimal(0);
        }
      }
      if (credit.greaterThan(0)) carry = carry.plus(credit);
    }
  }

  const now = Date.now();
  const bucket = { current: z(), days31to60: z(), days61to90: z(), over90: z() };
  for (const debit of openDebits) {
    const ageDays = Math.floor((now - debit.date.getTime()) / 86_400_000);
    if (ageDays <= 30) bucket.current = bucket.current.plus(debit.amount);
    else if (ageDays <= 60) bucket.days31to60 = bucket.days31to60.plus(debit.amount);
    else if (ageDays <= 90) bucket.days61to90 = bucket.days61to90.plus(debit.amount);
    else bucket.over90 = bucket.over90.plus(debit.amount);
  }

  const total = bucket.current.plus(bucket.days31to60).plus(bucket.days61to90).plus(bucket.over90);
  return {
    current: bucket.current.toFixed(2),
    days31to60: bucket.days31to60.toFixed(2),
    days61to90: bucket.days61to90.toFixed(2),
    over90: bucket.over90.toFixed(2),
    total: total.toFixed(2),
  };
}
