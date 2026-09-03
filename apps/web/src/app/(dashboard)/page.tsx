'use client';

import { AlertTriangle, PiggyBank, ShoppingCart, TrendingUp, Wallet } from 'lucide-react';
import type { ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  formatCount,
  formatMoney,
  Spinner,
} from '@stokk/ui';

import { HourlyChart } from '../../components/dashboard/hourly-chart';
import { RecentSales } from '../../components/dashboard/recent-sales';
import { StatTile } from '../../components/dashboard/stat-tile';
import { useDashboardSummary, useHourlySales, useRecentSales } from '../../hooks/use-dashboard';
import { apiErrorMessage } from '../../lib/api';
import { usePermission } from '../../lib/permissions';
import { useAuthStore } from '../../stores/auth-store';

function today(): string {
  return new Intl.DateTimeFormat('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}

export default function DashboardPage(): ReactElement {
  const user = useAuthStore((s) => s.user);
  const canReports = usePermission(PERMISSIONS.REPORT_SALES_VIEW);
  const canSales = usePermission(PERMISSIONS.SALE_VIEW);

  const summary = useDashboardSummary(canReports);
  const hourly = useHourlySales(canReports);
  const recent = useRecentSales(canSales);

  const firstName = user?.fullName.split(' ')[0] ?? '';

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-ink text-xl font-semibold tracking-tight">
          {firstName ? `Merhaba ${firstName}` : 'Panel'}
        </h1>
        <p className="text-ink-muted text-sm capitalize">{today()}</p>
      </header>

      {canReports ? (
        summary.isError ? (
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-danger text-sm">{apiErrorMessage(summary.error)}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void summary.refetch();
                }}
              >
                Tekrar dene
              </Button>
            </div>
          </Card>
        ) : (
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Bugünün cirosu"
              value={summary.data ? formatMoney(summary.data.salesTotal) : '—'}
              icon={TrendingUp}
              tone="brand"
              loading={summary.isPending}
            />
            {summary.data?.profit !== undefined ? (
              <StatTile
                label="Bugünün kârı"
                value={formatMoney(summary.data.profit)}
                icon={PiggyBank}
                tone="brand"
                loading={summary.isPending}
              />
            ) : (
              <StatTile
                label="Açık vardiya nakiti"
                value={summary.data ? formatMoney(summary.data.openCashExpected) : '—'}
                hint={
                  summary.data
                    ? `${formatCount(summary.data.openSessions)} açık vardiya`
                    : undefined
                }
                icon={Wallet}
                tone="neutral"
                loading={summary.isPending}
              />
            )}
            <StatTile
              label="Satış adedi"
              value={summary.data ? formatCount(summary.data.salesCount) : '—'}
              icon={ShoppingCart}
              tone="neutral"
              loading={summary.isPending}
            />
            <StatTile
              label="Kritik stok"
              value={summary.data ? formatCount(summary.data.lowStockCount) : '—'}
              hint="Kritik seviyeye inen ürün"
              icon={AlertTriangle}
              tone={summary.data && summary.data.lowStockCount > 0 ? 'warning' : 'neutral'}
              loading={summary.isPending}
            />
          </section>
        )
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {canReports ? (
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Saatlik ciro</CardTitle>
            </CardHeader>
            <CardBody>
              {hourly.isPending ? (
                <div className="flex h-56 items-center justify-center">
                  <Spinner label="Yükleniyor" />
                </div>
              ) : hourly.isError ? (
                <p className="text-danger text-sm">{apiErrorMessage(hourly.error)}</p>
              ) : (
                <HourlyChart series={hourly.data?.series ?? []} />
              )}
            </CardBody>
          </Card>
        ) : null}

        {canSales ? (
          <Card className={canReports ? 'lg:col-span-2' : 'lg:col-span-5'}>
            <CardHeader>
              <CardTitle>Son satışlar</CardTitle>
            </CardHeader>
            <CardBody>
              {recent.isPending ? (
                <div className="flex h-40 items-center justify-center">
                  <Spinner label="Yükleniyor" />
                </div>
              ) : recent.isError ? (
                <p className="text-danger text-sm">{apiErrorMessage(recent.error)}</p>
              ) : (
                <RecentSales items={recent.data?.items ?? []} />
              )}
            </CardBody>
          </Card>
        ) : null}
      </div>

      {!canReports && !canSales ? (
        <EmptyState
          icon={AlertTriangle}
          title="Panel özeti için yetkiniz yok"
          description="Rapor ve satış görüntüleme izni olmayan hesaplar için panel boştur. Yöneticinizden yetki isteyin."
        />
      ) : null}
    </div>
  );
}
