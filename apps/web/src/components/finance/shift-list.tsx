'use client';

import { Wallet } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, type ReactElement } from 'react';

import { Badge, EmptyState, formatDateTime, formatMoney, Select } from '@stokk/ui';

import { FinanceTabs } from './finance-tabs';
import { useCashSessions } from '../../hooks/use-cash-sessions';
import { apiErrorMessage } from '../../lib/api';
import type { CashSessionListItem } from '../../lib/api-types';
import { DataTable, type Column } from '../common/data-table';
import { PageHeader } from '../common/page-header';

const STATUS_FILTERS = [
  { value: '', label: 'Tüm vardiyalar' },
  { value: 'OPEN', label: 'Açık' },
  { value: 'CLOSED', label: 'Kapalı' },
] as const;

/** Fark sıfırdan farklıysa kasada eksik/fazla var demektir — rozetle işaretlenir. */
function differenceTone(difference: string | null): 'success' | 'danger' | 'neutral' {
  if (difference === null) return 'neutral';
  const value = Number.parseFloat(difference);
  if (!Number.isFinite(value) || value === 0) return 'success';
  return 'danger';
}

/** Kasa vardiyaları geçmişi — açılış, kapanış ve fark. */
export function ShiftList(): ReactElement {
  const [status, setStatus] = useState<'OPEN' | 'CLOSED' | ''>('');
  const sessions = useCashSessions(status === '' ? undefined : status);

  const columns = useMemo<Column<CashSessionListItem>[]>(
    () => [
      {
        key: 'openedAt',
        header: 'Açılış',
        fixed: true,
        cell: (session) => (
          <Link
            href={`/finance/shifts/${session.id}`}
            className="text-ink font-medium hover:underline"
          >
            <span className="tabular">{formatDateTime(session.openedAt)}</span>
          </Link>
        ),
      },
      { key: 'register', header: 'Kasa', cell: (session) => session.register.name },
      {
        key: 'closedAt',
        header: 'Kapanış',
        cell: (session) =>
          session.closedAt ? (
            <span className="tabular">{formatDateTime(session.closedAt)}</span>
          ) : (
            <Badge tone="brand">Açık</Badge>
          ),
      },
      {
        key: 'openingAmount',
        header: 'Açılış nakiti',
        numeric: true,
        cell: (session) => formatMoney(session.openingAmount),
      },
      {
        key: 'closingAmount',
        header: 'Sayılan',
        numeric: true,
        cell: (session) =>
          session.closingAmount === null ? '—' : formatMoney(session.closingAmount),
      },
      {
        key: 'differenceAmount',
        header: 'Fark',
        numeric: true,
        cell: (session) => {
          if (session.differenceAmount === null) return <span className="text-ink-subtle">—</span>;
          const tone = differenceTone(session.differenceAmount);
          return (
            <span className={tone === 'danger' ? 'text-danger font-medium' : 'text-success'}>
              {formatMoney(session.differenceAmount)}
            </span>
          );
        },
      },
    ],
    [],
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Finans" description="İşletme gider ve gelirleri, kasa vardiyaları." />
      <FinanceTabs />

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink font-medium">Durum</span>
          <Select
            className="w-44"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as 'OPEN' | 'CLOSED' | '');
            }}
          >
            {STATUS_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <DataTable
        columns={columns}
        rows={sessions.data ?? []}
        rowKey={(session) => session.id}
        loading={sessions.isPending}
        error={sessions.isError ? apiErrorMessage(sessions.error) : null}
        onRetry={() => {
          void sessions.refetch();
        }}
        rowClassName={(session) =>
          differenceTone(session.differenceAmount) === 'danger' ? 'bg-danger-weak/40' : undefined
        }
        empty={
          <EmptyState
            icon={Wallet}
            title="Vardiya kaydı yok"
            description="Kasa vardiyaları POS uygulamasından açılıp kapatılır; geçmiş burada görünür."
          />
        }
      />
    </div>
  );
}
