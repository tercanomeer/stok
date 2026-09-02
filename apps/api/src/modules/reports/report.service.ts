import { Injectable } from '@nestjs/common';

import { Prisma } from '@stokk/db';
import { PERMISSIONS } from '@stokk/types';

import { ForbiddenError } from '../../common/errors/domain-error.js';
import { PrismaService, type TenantTransaction } from '../../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import { ContactLedgerService } from '../contacts/contact-ledger.service.js';
import type {
  DailyShiftInput,
  RangeInput,
  SalesReportInput,
  TopProductsInput,
} from './dto/report.dto.js';

/**
 * Raporlar — ağır agregasyonlar $queryRaw ile (02-teknoloji kararı). Hepsi `withTenant`
 * içinde koşar: RLS `app.tenant_id` filtresini uygular; ayrıca WHERE'e açık `tenantId`
 * koyarak (tenantId, tarih) bileşik indekslerinin kullanılmasını sağlarız.
 *
 * Maliyet/kâr yalnız yetkili rollerde döner (REPORT_PROFIT_VIEW / PRODUCT_COST_VIEW);
 * yetkisiz istek ya 403 alır ya da maliyet alanları çıkarılır.
 *
 * Sayılan satış = iptal/park dışı (COMPLETED, PARTIALLY_RETURNED, RETURNED).
 */
@Injectable()
export class ReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: ContactLedgerService,
  ) {}

  /** Dashboard özeti — stat tile'lar (ciro, satış sayısı, kâr?, açık vardiya nakiti, kritik stok). */
  async dashboard(input: RangeInput, user: AuthenticatedUser) {
    const canProfit = user.permissions.includes(PERMISSIONS.REPORT_PROFIT_VIEW);
    return this.prisma.withTenant(async (tx, tenantId) => {
      const from = new Date(input.from);
      const to = new Date(input.to);

      const sales = await tx.$queryRaw<{ total: string; cnt: number }[]>`
        SELECT COALESCE(SUM("grandTotal"), 0)::text AS total, COUNT(*)::int AS cnt
        FROM sales
        WHERE "tenantId" = ${tenantId} AND status <> 'CANCELLED' AND status <> 'PARKED'
          AND "soldAt" >= ${from} AND "soldAt" <= ${to}`;

      const lowStock = await tx.$queryRaw<{ cnt: number }[]>`
        SELECT COUNT(*)::int AS cnt FROM products
        WHERE "tenantId" = ${tenantId} AND "deletedAt" IS NULL AND "trackStock" = true
          AND "isActive" = true AND "criticalLevel" > 0 AND "stockQuantity" <= "criticalLevel"`;

      const openCash = await tx.$queryRaw<{ expected: string; cnt: number }[]>`
        SELECT COALESCE(SUM(m.amount), 0)::text AS expected, COUNT(DISTINCT s.id)::int AS cnt
        FROM cash_sessions s
        LEFT JOIN cash_movements m ON m."cashSessionId" = s.id
        WHERE s."tenantId" = ${tenantId} AND s.status = 'OPEN'`;

      const result: Record<string, unknown> = {
        period: { from: input.from, to: input.to },
        salesTotal: sales[0]!.total,
        salesCount: sales[0]!.cnt,
        lowStockCount: lowStock[0]!.cnt,
        openSessions: openCash[0]!.cnt,
        openCashExpected: openCash[0]!.expected,
      };
      if (canProfit) {
        result.profit = (await this.profitTotals(tx, tenantId, from, to)).profit;
      }
      return result;
    });
  }

  /** Satış raporu — zaman serisi (çizgi grafik). */
  async sales(input: SalesReportInput) {
    return this.prisma.withTenant(async (tx, tenantId) => {
      const from = new Date(input.from);
      const to = new Date(input.to);
      const bucket = this.truncUnit(input.granularity);
      const rows = await tx.$queryRaw<{ date: Date; total: string; cnt: number }[]>`
        SELECT date_trunc(${bucket}, "soldAt") AS date,
               SUM("grandTotal")::text AS total, COUNT(*)::int AS cnt
        FROM sales
        WHERE "tenantId" = ${tenantId} AND status <> 'CANCELLED' AND status <> 'PARKED'
          AND "soldAt" >= ${from} AND "soldAt" <= ${to}
        GROUP BY 1 ORDER BY 1 ASC`;
      return {
        period: { from: input.from, to: input.to },
        granularity: input.granularity,
        series: rows.map((r) => ({ date: r.date.toISOString(), total: r.total, count: r.cnt })),
      };
    });
  }

  /** Kâr raporu — zaman serisi ciro/maliyet/kâr. REPORT_PROFIT_VIEW zorunlu. */
  async profit(input: SalesReportInput, user: AuthenticatedUser) {
    if (!user.permissions.includes(PERMISSIONS.REPORT_PROFIT_VIEW)) {
      throw new ForbiddenError('Kâr raporu yetkiniz yok.', {
        required: PERMISSIONS.REPORT_PROFIT_VIEW,
      });
    }
    return this.prisma.withTenant(async (tx, tenantId) => {
      const from = new Date(input.from);
      const to = new Date(input.to);
      const bucket = this.truncUnit(input.granularity);
      // Ciro (net, KDV hariç) = SUM(sale_item.netAmount); maliyet = SUM(unitCost*qty).
      // İadeler ayrı düşülür: net iade = lineTotal/(1+vat/100), maliyet iade = origUnitCost*qty.
      const rows = await tx.$queryRaw<{ date: Date; revenue: string; cost: string }[]>`
        WITH sold AS (
          SELECT date_trunc(${bucket}, s."soldAt") AS d,
                 SUM(si."netAmount") AS revenue, SUM(si."unitCost" * si.quantity) AS cost
          FROM sale_items si JOIN sales s ON s.id = si."saleId"
          WHERE s."tenantId" = ${tenantId} AND s.status <> 'CANCELLED' AND s.status <> 'PARKED'
            AND s."soldAt" >= ${from} AND s."soldAt" <= ${to}
          GROUP BY 1
        ),
        returned AS (
          SELECT date_trunc(${bucket}, sr."createdAt") AS d,
                 SUM(sri."lineTotal" / (1 + sri."vatRate" / 100.0)) AS revenue,
                 SUM(sri.quantity * si."unitCost") AS cost
          FROM sale_return_items sri
          JOIN sale_returns sr ON sr.id = sri."saleReturnId"
          JOIN sale_items si ON si.id = sri."saleItemId"
          WHERE sr."tenantId" = ${tenantId} AND sr."createdAt" >= ${from} AND sr."createdAt" <= ${to}
          GROUP BY 1
        )
        SELECT COALESCE(sold.d, returned.d) AS date,
               (COALESCE(sold.revenue, 0) - COALESCE(returned.revenue, 0))::text AS revenue,
               (COALESCE(sold.cost, 0) - COALESCE(returned.cost, 0))::text AS cost
        FROM sold FULL OUTER JOIN returned ON sold.d = returned.d
        ORDER BY 1 ASC`;

      const series = rows.map((r) => {
        const revenue = new Prisma.Decimal(r.revenue);
        const cost = new Prisma.Decimal(r.cost);
        const profit = revenue.minus(cost);
        const margin = revenue.isZero() ? '0.00' : profit.div(revenue).mul(100).toFixed(2);
        return {
          date: r.date.toISOString(),
          revenue: revenue.toFixed(2),
          cost: cost.toFixed(2),
          profit: profit.toFixed(2),
          marginPct: margin,
        };
      });
      const totals = series.reduce(
        (a, s) => ({
          revenue: a.revenue.plus(s.revenue),
          cost: a.cost.plus(s.cost),
          profit: a.profit.plus(s.profit),
        }),
        {
          revenue: new Prisma.Decimal(0),
          cost: new Prisma.Decimal(0),
          profit: new Prisma.Decimal(0),
        },
      );
      return {
        period: { from: input.from, to: input.to },
        granularity: input.granularity,
        series,
        totals: {
          revenue: totals.revenue.toFixed(2),
          cost: totals.cost.toFixed(2),
          profit: totals.profit.toFixed(2),
        },
      };
    });
  }

  /**
   * En çok satanlar — MİKTAR bazlı sıralı (yatay bar). Kâr yalnız PRODUCT_COST_VIEW ile.
   * İadeler DÜŞÜLMEZ (brüt satış miktarı/cirosu); "gerçekleşen kâr" için profit raporuna bakılır.
   */
  async topProducts(input: TopProductsInput, user: AuthenticatedUser) {
    const canCost = user.permissions.includes(PERMISSIONS.PRODUCT_COST_VIEW);
    return this.prisma.withTenant(async (tx, tenantId) => {
      const from = new Date(input.from);
      const to = new Date(input.to);
      const rows = await tx.$queryRaw<
        { productId: string; name: string; quantity: string; revenue: string; cost: string }[]
      >`
        SELECT si."productId", MAX(si."productName") AS name,
               SUM(si.quantity)::text AS quantity, SUM(si."netAmount")::text AS revenue,
               SUM(si."unitCost" * si.quantity)::text AS cost
        FROM sale_items si JOIN sales s ON s.id = si."saleId"
        WHERE s."tenantId" = ${tenantId} AND s.status <> 'CANCELLED' AND s.status <> 'PARKED'
          AND s."soldAt" >= ${from} AND s."soldAt" <= ${to}
        GROUP BY si."productId"
        ORDER BY SUM(si.quantity) DESC
        LIMIT ${input.limit}`;
      return {
        period: { from: input.from, to: input.to },
        items: rows.map((r) => ({
          productId: r.productId,
          name: r.name,
          quantity: r.quantity,
          revenue: r.revenue,
          ...(canCost ? { profit: new Prisma.Decimal(r.revenue).minus(r.cost).toFixed(2) } : {}),
        })),
      };
    });
  }

  /** Kasiyer performansı — bar. */
  async cashierPerformance(input: RangeInput) {
    return this.prisma.withTenant(async (tx, tenantId) => {
      const from = new Date(input.from);
      const to = new Date(input.to);
      const rows = await tx.$queryRaw<
        { userId: string; name: string; cnt: number; total: string }[]
      >`
        SELECT s."userId", MAX(u."fullName") AS name,
               COUNT(*)::int AS cnt, SUM(s."grandTotal")::text AS total
        FROM sales s JOIN users u ON u.id = s."userId"
        WHERE s."tenantId" = ${tenantId} AND s.status <> 'CANCELLED' AND s.status <> 'PARKED'
          AND s."soldAt" >= ${from} AND s."soldAt" <= ${to}
        GROUP BY s."userId"
        ORDER BY SUM(s."grandTotal") DESC`;
      return {
        period: { from: input.from, to: input.to },
        cashiers: rows.map((r) => ({
          userId: r.userId,
          name: r.name,
          salesCount: r.cnt,
          salesTotal: r.total,
          avgBasket: r.cnt > 0 ? new Prisma.Decimal(r.total).div(r.cnt).toFixed(2) : '0.00',
        })),
      };
    });
  }

  /** Saatlik yoğunluk — ısı haritası (haftagünü × saat). */
  async hourlyDensity(input: RangeInput) {
    return this.prisma.withTenant(async (tx, tenantId) => {
      const from = new Date(input.from);
      const to = new Date(input.to);
      // Europe/Istanbul yerel saatine göre (UTC sakla, yerelde göster — CLAUDE.md).
      const rows = await tx.$queryRaw<
        { weekday: number; hour: number; cnt: number; total: string }[]
      >`
        SELECT EXTRACT(DOW FROM "soldAt" AT TIME ZONE 'Europe/Istanbul')::int AS weekday,
               EXTRACT(HOUR FROM "soldAt" AT TIME ZONE 'Europe/Istanbul')::int AS hour,
               COUNT(*)::int AS cnt, SUM("grandTotal")::text AS total
        FROM sales
        WHERE "tenantId" = ${tenantId} AND status <> 'CANCELLED' AND status <> 'PARKED'
          AND "soldAt" >= ${from} AND "soldAt" <= ${to}
        GROUP BY 1, 2 ORDER BY 1, 2`;
      return {
        period: { from: input.from, to: input.to },
        cells: rows.map((r) => ({
          weekday: r.weekday,
          hour: r.hour,
          count: r.cnt,
          total: r.total,
        })),
      };
    });
  }

  /**
   * Stok değeri — stat + kategori bazında bar. Maliyet yalnız PRODUCT_COST_VIEW ile.
   * costValue = stok × averageCost (envanter maliyeti); saleValue = stok × salePrice
   * (POTANSİYEL ciro — henüz satılmadı, gerçekleşen gelir değil).
   */
  async stockValue(user: AuthenticatedUser) {
    if (!user.permissions.includes(PERMISSIONS.PRODUCT_COST_VIEW)) {
      throw new ForbiddenError('Stok maliyet değeri yetkiniz yok.', {
        required: PERMISSIONS.PRODUCT_COST_VIEW,
      });
    }
    return this.prisma.withTenant(async (tx, tenantId) => {
      const rows = await tx.$queryRaw<
        { categoryId: string | null; name: string | null; costValue: string; saleValue: string }[]
      >`
        SELECT p."categoryId", MAX(c.name) AS name,
               SUM(p."stockQuantity" * p."averageCost")::text AS "costValue",
               SUM(p."stockQuantity" * p."salePrice")::text AS "saleValue"
        FROM products p LEFT JOIN categories c ON c.id = p."categoryId"
        WHERE p."tenantId" = ${tenantId} AND p."deletedAt" IS NULL AND p."trackStock" = true
        GROUP BY p."categoryId"
        ORDER BY SUM(p."stockQuantity" * p."averageCost") DESC`;
      const totalCost = rows.reduce((a, r) => a.plus(r.costValue), new Prisma.Decimal(0));
      const totalSale = rows.reduce((a, r) => a.plus(r.saleValue), new Prisma.Decimal(0));
      return {
        totalCostValue: totalCost.toFixed(2),
        totalSaleValue: totalSale.toFixed(2),
        byCategory: rows.map((r) => ({
          categoryId: r.categoryId,
          name: r.name ?? 'Kategorisiz',
          costValue: new Prisma.Decimal(r.costValue).toFixed(2),
          saleValue: new Prisma.Decimal(r.saleValue).toFixed(2),
        })),
      };
    });
  }

  /**
   * Cari yaşlandırma — bakiyesi olan carilerin kova dağılımı (stacked bar).
   * En yüksek bakiyeli 500 cari (kredi riski odağı); daha fazlası için sayfalama Faz 11.
   * Yaşlandırma TEK sorguyla toplu hesaplanır (agingForContacts) — cari başına ayrı
   * transaction (N+1) yok (performance/db-optimizer bulgusu).
   */
  async contactAging() {
    const contacts = await this.prisma.withTenant((tx) =>
      tx.contact.findMany({
        where: { deletedAt: null, balance: { gt: 0 } },
        select: { id: true, name: true },
        orderBy: { balance: 'desc' },
        take: 500,
      }),
    );
    const aging = await this.ledger.agingForContacts(contacts.map((c) => c.id));
    const rows = contacts.map((c) => {
      const buckets = aging.get(c.id)!;
      return { contactId: c.id, name: c.name, ...buckets };
    });
    const totals = rows.reduce(
      (a, r) => ({
        current: a.current.plus(r.current),
        days31to60: a.days31to60.plus(r.days31to60),
        days61to90: a.days61to90.plus(r.days61to90),
        over90: a.over90.plus(r.over90),
      }),
      {
        current: new Prisma.Decimal(0),
        days31to60: new Prisma.Decimal(0),
        days61to90: new Prisma.Decimal(0),
        over90: new Prisma.Decimal(0),
      },
    );
    return {
      contacts: rows,
      totals: {
        current: totals.current.toFixed(2),
        days31to60: totals.days31to60.toFixed(2),
        days61to90: totals.days61to90.toFixed(2),
        over90: totals.over90.toFixed(2),
      },
    };
  }

  /** Ödeme yöntemi dağılımı — pasta grafik. */
  async paymentDistribution(input: RangeInput) {
    return this.prisma.withTenant(async (tx, tenantId) => {
      const from = new Date(input.from);
      const to = new Date(input.to);
      const rows = await tx.$queryRaw<{ method: string; total: string; cnt: number }[]>`
        SELECT sp.method, SUM(sp.amount)::text AS total, COUNT(*)::int AS cnt
        FROM sale_payments sp JOIN sales s ON s.id = sp."saleId"
        WHERE s."tenantId" = ${tenantId} AND s.status <> 'CANCELLED' AND s.status <> 'PARKED'
          AND s."soldAt" >= ${from} AND s."soldAt" <= ${to}
        GROUP BY sp.method`;
      const grand = rows.reduce((a, r) => a.plus(r.total), new Prisma.Decimal(0));
      return {
        period: { from: input.from, to: input.to },
        total: grand.toFixed(2),
        methods: rows.map((r) => ({
          method: r.method,
          total: r.total,
          count: r.cnt,
          pct: grand.isZero() ? '0.00' : new Prisma.Decimal(r.total).div(grand).mul(100).toFixed(2),
        })),
      };
    });
  }

  /** Günlük vardiya özeti — tablo. */
  async dailyShift(input: DailyShiftInput) {
    return this.prisma.withTenant(async (tx, tenantId) => {
      const dayStart = new Date(`${input.date}T00:00:00.000Z`);
      const dayEnd = new Date(`${input.date}T23:59:59.999Z`);
      const rows = await tx.$queryRaw<
        {
          id: string;
          cashier: string;
          opening: string;
          expected: string | null;
          closing: string | null;
          difference: string | null;
          salesTotal: string;
        }[]
      >`
        SELECT cs.id, MAX(u."fullName") AS cashier,
               cs."openingAmount"::text AS opening, cs."expectedAmount"::text AS expected,
               cs."closingAmount"::text AS closing, cs."differenceAmount"::text AS difference,
               COALESCE(SUM(s."grandTotal") FILTER (WHERE s.status <> 'CANCELLED' AND s.status <> 'PARKED'), 0)::text AS "salesTotal"
        FROM cash_sessions cs
        JOIN users u ON u.id = cs."userId"
        LEFT JOIN sales s ON s."cashSessionId" = cs.id
        WHERE cs."tenantId" = ${tenantId} AND cs."openedAt" >= ${dayStart} AND cs."openedAt" <= ${dayEnd}
        GROUP BY cs.id
        ORDER BY cs."openedAt" ASC`;
      return { date: input.date, sessions: rows };
    });
  }

  // --- yardımcılar ---
  /**
   * Dönem kâr toplamı — İADELER DÜŞÜLÜR (profit() raporuyla aynı tanım; data-analyst bulgusu:
   * dashboard.profit ile rapor tutarlı olmalı). Net ciro − net maliyet.
   */
  private async profitTotals(tx: TenantTransaction, tenantId: string, from: Date, to: Date) {
    const rows = await tx.$queryRaw<{ revenue: string; cost: string }[]>`
      WITH sold AS (
        SELECT COALESCE(SUM(si."netAmount"), 0) AS revenue,
               COALESCE(SUM(si."unitCost" * si.quantity), 0) AS cost
        FROM sale_items si JOIN sales s ON s.id = si."saleId"
        WHERE s."tenantId" = ${tenantId} AND s.status <> 'CANCELLED' AND s.status <> 'PARKED'
          AND s."soldAt" >= ${from} AND s."soldAt" <= ${to}
      ),
      returned AS (
        SELECT COALESCE(SUM(sri."lineTotal" / (1 + sri."vatRate" / 100.0)), 0) AS revenue,
               COALESCE(SUM(sri.quantity * si."unitCost"), 0) AS cost
        FROM sale_return_items sri
        JOIN sale_returns sr ON sr.id = sri."saleReturnId"
        JOIN sale_items si ON si.id = sri."saleItemId"
        WHERE sr."tenantId" = ${tenantId} AND sr."createdAt" >= ${from} AND sr."createdAt" <= ${to}
      )
      SELECT (sold.revenue - returned.revenue)::text AS revenue,
             (sold.cost - returned.cost)::text AS cost
      FROM sold, returned`;
    const revenue = new Prisma.Decimal(rows[0]!.revenue);
    const cost = new Prisma.Decimal(rows[0]!.cost);
    return {
      revenue: revenue.toFixed(2),
      cost: cost.toFixed(2),
      profit: revenue.minus(cost).toFixed(2),
    };
  }

  private truncUnit(granularity: 'hour' | 'day' | 'week' | 'month'): string {
    return granularity;
  }
}
