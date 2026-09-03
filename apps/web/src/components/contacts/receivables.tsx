'use client';

import { AlertTriangle, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useMemo, type ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  formatCount,
  formatMoney,
  Spinner,
} from '@stokk/ui';

import { useContactAging, useContacts } from '../../hooks/use-contacts';
import { apiErrorMessage } from '../../lib/api';
import type { ContactAgingRow } from '../../lib/api-types';
import { isOverCreditLimit } from '../../lib/contact-balance';
import { parseListParams } from '../../lib/list-params';
import { usePermission } from '../../lib/permissions';
import { DataTable, type Column } from '../common/data-table';
import { PageHeader } from '../common/page-header';

/** Limit aşan carileri bulmak için borçlu carilerin tamamı çekilir (sunucu üst sınırı 100). */
const DEBTORS_PARAMS = parseListParams('limit=100&balance=debtor', { filterKeys: ['balance'] });

/**
 * Veresiye defteri: limit aşanlar + yaşlandırma tablosu.
 *
 * Yaşlandırma `/reports/contact-aging` ucundan gelir — cari başına ayrı sorgu (N+1)
 * yok, tek sorguda hesaplanır. Limit aşımı bakiyeden türer, o yüzden cari listesi
 * ayrıca çekilir (yaşlandırma ucu limiti taşımıyor).
 */
export function Receivables(): ReactElement {
  const canReport = usePermission(PERMISSIONS.REPORT_SALES_VIEW);
  const aging = useContactAging(canReport);
  const debtors = useContacts(DEBTORS_PARAMS);

  const overLimit = useMemo(
    () => (debtors.data?.items ?? []).filter(isOverCreditLimit),
    [debtors.data],
  );

  const columns = useMemo<Column<ContactAgingRow>[]>(
    () => [
      {
        key: 'name',
        header: 'Cari',
        fixed: true,
        cell: (row) => (
          <Link
            href={`/contacts/${row.contactId}`}
            className="text-ink font-medium hover:underline"
          >
            {row.name}
          </Link>
        ),
      },
      {
        key: 'current',
        header: '0–30 gün',
        numeric: true,
        cell: (row) => formatMoney(row.current),
      },
      {
        key: 'days31to60',
        header: '31–60 gün',
        numeric: true,
        cell: (row) => formatMoney(row.days31to60),
      },
      {
        key: 'days61to90',
        header: '61–90 gün',
        numeric: true,
        cell: (row) => formatMoney(row.days61to90),
      },
      {
        key: 'over90',
        header: '90+ gün',
        numeric: true,
        cell: (row) => (
          <span
            className={Number.parseFloat(row.over90) > 0 ? 'text-danger font-medium' : undefined}
          >
            {formatMoney(row.over90)}
          </span>
        ),
      },
      {
        key: 'total',
        header: 'Toplam',
        numeric: true,
        cell: (row) => <span className="font-medium">{formatMoney(row.total)}</span>,
      },
    ],
    [],
  );

  if (!canReport) {
    return (
      <EmptyState
        icon={Wallet}
        title="Veresiye defteri için yetkiniz yok"
        description="Yaşlandırma raporu görüntüleme izni gerekiyor. Yöneticinizden isteyin."
      />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Veresiye defteri"
        description="Alacakların yaşlandırması ve limit aşan cariler."
      />

      {overLimit.length > 0 ? (
        <div
          role="status"
          className="rounded-card border-danger/30 bg-danger-weak text-danger flex flex-wrap items-start justify-between gap-3 border px-4 py-3"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="text-sm">
              <p className="font-medium">
                {formatCount(overLimit.length)} cari veresiye limitini aştı
              </p>
              <p className="opacity-90">
                {overLimit
                  .slice(0, 4)
                  .map(
                    (c) => `${c.name} (${formatMoney(c.balance)} / ${formatMoney(c.creditLimit)})`,
                  )
                  .join(' · ')}
                {overLimit.length > 4 ? ` · +${formatCount(overLimit.length - 4)}` : ''}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <BucketTile label="0–30 gün" value={aging.data?.totals.current} loading={aging.isPending} />
        <BucketTile
          label="31–60 gün"
          value={aging.data?.totals.days31to60}
          loading={aging.isPending}
        />
        <BucketTile
          label="61–90 gün"
          value={aging.data?.totals.days61to90}
          loading={aging.isPending}
        />
        <BucketTile
          label="90+ gün"
          value={aging.data?.totals.over90}
          loading={aging.isPending}
          tone="danger"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cari bazında yaşlandırma</CardTitle>
        </CardHeader>
        <CardBody>
          <DataTable
            columns={columns}
            rows={aging.data?.contacts ?? []}
            rowKey={(row) => row.contactId}
            loading={aging.isPending}
            error={aging.isError ? apiErrorMessage(aging.error) : null}
            onRetry={() => {
              void aging.refetch();
            }}
            empty={
              <EmptyState
                icon={Wallet}
                title="Açık alacak yok"
                description="Bakiyesi olan cari bulunmuyor — defter temiz."
              />
            }
          />
        </CardBody>
      </Card>
    </div>
  );
}

function BucketTile({
  label,
  value,
  loading,
  tone,
}: {
  label: string;
  value: string | undefined;
  loading: boolean;
  tone?: 'danger';
}): ReactElement {
  return (
    <Card className="p-4">
      <p className="text-ink-muted text-sm">{label}</p>
      {loading ? (
        <Spinner />
      ) : (
        <p
          className={
            tone === 'danger'
              ? 'text-danger tabular text-xl font-semibold'
              : 'text-ink tabular text-xl font-semibold'
          }
        >
          {formatMoney(value ?? '0')}
        </p>
      )}
    </Card>
  );
}
