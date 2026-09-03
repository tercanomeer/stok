'use client';

import { BarChart3, ShieldAlert } from 'lucide-react';
import { useState, type ReactElement, type ReactNode } from 'react';

import { PERMISSIONS } from '@stokk/types';
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  formatCount,
  formatDate,
  formatMoney,
  formatPercent,
  formatQuantity,
  Input,
  Select,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@stokk/ui';

import { ExportButton } from './export-button';
import {
  useCashierPerformance,
  useDailyShift,
  useHourlyDensity,
  usePaymentDistribution,
  useProfitReport,
  useSalesReport,
  useStockValue,
  useTopProducts,
} from '../../hooks/use-reports';
import { apiErrorMessage } from '../../lib/api';
import { PAYMENT_METHOD_LABELS } from '../../lib/finance-labels';
import { usePermission } from '../../lib/permissions';
import { BarChart, type BarDatum } from '../charts/bar-chart';
import { RankedBars } from '../charts/ranked-bars';
import { ShareBar } from '../charts/share-bar';
import { PageHeader } from '../common/page-header';

type Granularity = 'hour' | 'day' | 'week' | 'month';

function toDateInput(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

/** Varsayılan aralık: son 30 gün — esnafın "bu ay nasıl gidiyor" sorusunun penceresi. */
function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  return { from: toDateInput(from), to: toDateInput(to) };
}

function toIso(range: { from: string; to: string }): { from: string; to: string } {
  return {
    from: new Date(`${range.from}T00:00:00`).toISOString(),
    to: new Date(`${range.to}T23:59:59.999`).toISOString(),
  };
}

/** Zaman ekseninde okunabilir kısa etiket (granülerliğe göre). */
function axisLabel(iso: string, granularity: Granularity): string {
  const date = new Date(iso);
  if (granularity === 'hour') {
    return `${String(date.getHours()).padStart(2, '0')}:00`;
  }
  return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' }).format(date);
}

/**
 * Rapor merkezi — tek tarih aralığı, altında her rapor kendi sorusunu cevaplayan
 * bir kartta. Yetkisi olmayan rapor hiç RENDER EDİLMEZ (sunucu da 403 verir).
 */
export function ReportsView(): ReactElement {
  const [range, setRange] = useState(defaultRange);
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [shiftDate, setShiftDate] = useState(() => toDateInput(new Date()));

  const canSales = usePermission(PERMISSIONS.REPORT_SALES_VIEW);
  const canProfit = usePermission(PERMISSIONS.REPORT_PROFIT_VIEW);
  const canStaff = usePermission(PERMISSIONS.REPORT_STAFF_VIEW);
  const canCost = usePermission(PERMISSIONS.PRODUCT_COST_VIEW);
  const canExport = usePermission(PERMISSIONS.REPORT_EXPORT);

  const iso = toIso(range);
  const sales = useSalesReport(iso, granularity, canSales);
  const profit = useProfitReport(iso, granularity, canProfit);
  const top = useTopProducts(iso, canSales);
  const payments = usePaymentDistribution(iso, canSales);
  const cashiers = useCashierPerformance(iso, canStaff);
  const hourly = useHourlyDensity(iso, canSales);
  const stockValue = useStockValue(canCost);
  const dailyShift = useDailyShift(shiftDate, canSales);

  if (!canSales && !canProfit && !canStaff && !canCost) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Rapor yetkiniz yok"
        description="Rapor görüntüleme izni olmayan hesaplar bu ekranı göremez. Yöneticinizden yetki isteyin."
      />
    );
  }

  const salesBars: BarDatum[] = (sales.data?.series ?? []).map((point) => ({
    label: axisLabel(point.date, granularity),
    value: point.total,
    display: formatMoney(point.total),
    hint: `${formatCount(point.count)} satış`,
  }));

  const profitBars: BarDatum[] = (profit.data?.series ?? []).map((point) => ({
    label: axisLabel(point.date, granularity),
    value: point.profit,
    display: formatMoney(point.profit),
    hint: `kâr marjı ${formatPercent(point.marginPct)}`,
  }));

  // Saatlik yoğunluk hücreleri gün×saat gelir. Aralıktaki TOPLAMI göstermek vardiya
  // planlamasında yanıltır (30 günlük aralıkta "14:00'te 450 satış" günlük 15 demektir);
  // gün sayısına bölünüp GÜNLÜK ORTALAMA gösterilir.
  const dayCount = Math.max(
    1,
    Math.round(
      (new Date(`${range.to}T00:00:00`).getTime() - new Date(`${range.from}T00:00:00`).getTime()) /
        86_400_000,
    ) + 1,
  );
  const hourlyBars: BarDatum[] = Array.from({ length: 24 }, (_, hour) => {
    const count = (hourly.data?.cells ?? [])
      .filter((cell) => cell.hour === hour)
      .reduce((sum, cell) => sum + cell.count, 0);
    const average = count / dayCount;
    return {
      label: `${String(hour).padStart(2, '0')}`,
      value: average.toFixed(2),
      display: `günde ort. ${formatQuantity(average.toFixed(1))} satış`,
      hint: `${formatCount(count)} satış / ${formatCount(dayCount)} gün`,
    };
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Raporlar"
        description="Seçilen tarih aralığında satış, kâr, ürün ve kasa performansı."
      />

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink font-medium">Başlangıç</span>
          <Input
            type="date"
            className="w-40"
            value={range.from}
            onChange={(e) => {
              setRange((prev) => ({ ...prev, from: e.target.value }));
            }}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink font-medium">Bitiş</span>
          <Input
            type="date"
            className="w-40"
            value={range.to}
            onChange={(e) => {
              setRange((prev) => ({ ...prev, to: e.target.value }));
            }}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink font-medium">Kırılım</span>
          <Select
            className="w-36"
            value={granularity}
            onChange={(e) => {
              setGranularity(e.target.value as Granularity);
            }}
          >
            <option value="hour">Saatlik</option>
            <option value="day">Günlük</option>
            <option value="week">Haftalık</option>
            <option value="month">Aylık</option>
          </Select>
        </label>
      </div>

      {canSales ? (
        <ReportCard
          title="Satış trendi"
          question="Brüt ciro zaman içinde nasıl seyretti? (KDV dahil, iadeler düşülmeden)"
          query={sales}
          action={
            canExport ? <ExportButton payload={{ report: 'sales', ...iso, granularity }} /> : null
          }
        >
          <div className="space-y-3">
            <BarChart data={salesBars} title="Satış trendi (brüt ciro)" valueLabel="Brüt ciro" />
            <p className="text-ink-muted text-xs">
              Bu grafik <strong className="text-ink">brüt ciroyu</strong> gösterir: KDV dahil ve
              iadeler düşülmemiş. Kâr kartındaki &ldquo;net ciro&rdquo; ise KDV hariç ve iadeler
              düşülmüş tutardır — iki sayı bilerek farklıdır.
            </p>
          </div>
        </ReportCard>
      ) : null}

      {canProfit ? (
        <ReportCard
          title="Kâr"
          question="Net cirodan ne kadarı kâr olarak kaldı? (KDV hariç, iadeler düşülmüş)"
          query={profit}
          action={
            canExport ? <ExportButton payload={{ report: 'profit', ...iso, granularity }} /> : null
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Metric
                label="Net ciro (KDV hariç)"
                value={formatMoney(profit.data?.totals.revenue ?? '0')}
              />
              <Metric label="Maliyet" value={formatMoney(profit.data?.totals.cost ?? '0')} />
              <Metric
                label="Kâr"
                value={formatMoney(profit.data?.totals.profit ?? '0')}
                tone="brand"
              />
            </div>
            <BarChart data={profitBars} title="Dönem kârı" valueLabel="Kâr" />
          </div>
        </ReportCard>
      ) : null}

      {canSales ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <ReportCard
            title="En çok satılanlar"
            question="Hangi ürünler en çok adet satıyor?"
            query={top}
            action={
              canExport ? (
                <ExportButton payload={{ report: 'top-products', ...iso, limit: 10 }} />
              ) : null
            }
          >
            {/*
              Sunucu MİKTARA göre sıralıyor (report.service topProducts). Çubuğu ciroya
              göre çizmek sıralı-çubuk sözleşmesini bozardı: üstteki satır alttakinden
              kısa görünürdü. Çubuk da miktar; ciro ipucu olarak yanında.
            */}
            <RankedBars
              title="En çok satılan ürünler (adet)"
              valueLabel="Satılan miktar"
              rows={(top.data?.items ?? []).map((item) => ({
                id: item.productId,
                label: item.name,
                value: item.quantity,
                display: formatQuantity(item.quantity),
                hint: `${formatMoney(item.revenue)} ciro`,
              }))}
            />
          </ReportCard>

          <ReportCard
            title="Ödeme dağılımı"
            question="Para hangi kanaldan geliyor? (paylar tutara göre)"
            query={payments}
            action={
              canExport ? (
                <ExportButton payload={{ report: 'payment-distribution', ...iso }} />
              ) : null
            }
          >
            <ShareBar
              title="Ödeme yöntemi dağılımı (tutara göre)"
              slices={(payments.data?.methods ?? []).map((method) => ({
                id: method.method,
                label: PAYMENT_METHOD_LABELS[method.method],
                pct: method.pct,
                display: formatMoney(method.total),
              }))}
            />
          </ReportCard>
        </div>
      ) : null}

      {canStaff ? (
        <ReportCard
          title="Kasiyer performansı"
          question="Kim ne kadar satış yaptı, sepet ortalaması ne?"
          query={cashiers}
          action={
            canExport ? <ExportButton payload={{ report: 'cashier-performance', ...iso }} /> : null
          }
        >
          <RankedBars
            title="Kasiyer performansı"
            valueLabel="Ciro"
            rows={(cashiers.data?.cashiers ?? []).map((cashier) => ({
              id: cashier.userId,
              label: cashier.name,
              value: cashier.salesTotal,
              display: formatMoney(cashier.salesTotal),
              hint: `${formatCount(cashier.salesCount)} satış · sepet ${formatMoney(cashier.avgBasket)}`,
            }))}
          />
        </ReportCard>
      ) : null}

      {canSales ? (
        <ReportCard
          title="Saatlik yoğunluk"
          question="Gün içinde hangi saatler yoğun — vardiya nasıl planlanmalı? (günlük ortalama)"
          query={hourly}
        >
          <BarChart
            data={hourlyBars}
            title="Saatlik satış yoğunluğu (günlük ortalama)"
            valueLabel="Günlük ortalama satış adedi"
          />
        </ReportCard>
      ) : null}

      {canCost ? (
        <ReportCard title="Stok değeri" question="Rafta ne kadar para duruyor?" query={stockValue}>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Metric
                label="Maliyet değeri"
                value={formatMoney(stockValue.data?.totalCostValue ?? '0')}
              />
              <Metric
                label="Satış değeri (potansiyel)"
                value={formatMoney(stockValue.data?.totalSaleValue ?? '0')}
              />
            </div>
            <p className="text-ink-muted text-xs">
              Satış değeri, raftaki ürünler satış fiyatından satılırsa elde edilecek tutardır —
              henüz gerçekleşmiş bir gelir değildir.
            </p>
            <RankedBars
              title="Kategori bazında stok değeri"
              valueLabel="Maliyet değeri"
              rows={(stockValue.data?.byCategory ?? []).map((row) => ({
                id: row.categoryId ?? row.name,
                label: row.name,
                value: row.costValue,
                display: formatMoney(row.costValue),
              }))}
            />
          </div>
        </ReportCard>
      ) : null}

      {canSales ? (
        <ReportCard
          title="Günlük vardiya özeti"
          question="Seçilen günde kasa nasıl kapandı?"
          query={dailyShift}
          action={
            <label className="flex items-center gap-2 text-sm">
              <span className="text-ink font-medium">Gün</span>
              <Input
                type="date"
                className="h-9 w-40"
                value={shiftDate}
                onChange={(e) => {
                  setShiftDate(e.target.value);
                }}
              />
            </label>
          }
        >
          <p className="text-ink-muted mb-3 text-xs">
            &ldquo;Toplam satış&rdquo; tüm ödeme yöntemlerini kapsar; &ldquo;Beklenen&rdquo;,
            &ldquo;Sayılan&rdquo; ve &ldquo;Fark&rdquo; yalnız NAKİT çekmecesi içindir.
          </p>
          {(dailyShift.data?.sessions ?? []).length === 0 ? (
            <p className="text-ink-muted text-sm">
              {formatDate(shiftDate)} tarihinde açılmış vardiya yok.
            </p>
          ) : (
            <div className="border-border rounded-control overflow-hidden border">
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>Kasiyer</TH>
                    <TH numeric>Açılış</TH>
                    <TH numeric>Toplam satış</TH>
                    <TH numeric>Beklenen</TH>
                    <TH numeric>Sayılan</TH>
                    <TH numeric>Fark</TH>
                  </TR>
                </THead>
                <TBody>
                  {(dailyShift.data?.sessions ?? []).map((session) => {
                    const difference =
                      session.difference === null ? null : Number.parseFloat(session.difference);
                    return (
                      <TR key={session.id}>
                        <TD>{session.cashier}</TD>
                        <TD numeric>{formatMoney(session.opening)}</TD>
                        <TD numeric>{formatMoney(session.salesTotal)}</TD>
                        <TD numeric>
                          {session.expected === null ? '—' : formatMoney(session.expected)}
                        </TD>
                        <TD numeric>
                          {session.closing === null ? '—' : formatMoney(session.closing)}
                        </TD>
                        <TD numeric>
                          {session.difference === null ? (
                            <span className="text-ink-subtle">—</span>
                          ) : (
                            <span
                              className={
                                difference !== null && difference !== 0
                                  ? 'text-danger font-medium'
                                  : 'text-success'
                              }
                            >
                              {formatMoney(session.difference)}
                            </span>
                          )}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>
          )}
        </ReportCard>
      ) : null}
    </div>
  );
}

interface QueryLike {
  isPending: boolean;
  isError: boolean;
  error: Error | null;
}

/** Her rapor kartı hangi SORUYU cevapladığını yazar — grafik tek başına anlatmaz. */
function ReportCard({
  title,
  question,
  query,
  action,
  children,
}: {
  title: string;
  question: string;
  query: QueryLike;
  action?: ReactNode;
  children: ReactNode;
}): ReactElement {
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="text-ink-muted text-sm">{question}</p>
        </div>
        {action}
      </CardHeader>
      <CardBody>
        {query.isPending ? (
          <div className="flex h-40 items-center justify-center">
            <Spinner label="Rapor hesaplanıyor" />
          </div>
        ) : query.isError ? (
          <p className="text-danger flex items-center gap-2 text-sm">
            <BarChart3 className="size-4" aria-hidden />
            {apiErrorMessage(query.error)}
          </p>
        ) : (
          children
        )}
      </CardBody>
    </Card>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'brand';
}): ReactElement {
  return (
    <div className="rounded-card border-border bg-surface-sunken border p-3">
      <p className="text-ink-muted text-xs">{label}</p>
      <p
        className={
          tone === 'brand'
            ? 'text-brand tabular text-xl font-semibold'
            : 'text-ink tabular text-xl font-semibold'
        }
      >
        {value}
      </p>
    </div>
  );
}
