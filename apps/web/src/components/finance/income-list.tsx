'use client';

import { Plus, TrendingUp } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';
import { Button, EmptyState, formatDate, formatMoney, Input, useToast } from '@stokk/ui';

import { EntryDialog } from './entry-dialog';
import { FinanceTabs } from './finance-tabs';
import { useCreateIncome, useIncomes } from '../../hooks/use-finance';
import { useListParams } from '../../hooks/use-list-params';
import { usePageClamp } from '../../hooks/use-page-clamp';
import { apiErrorMessage } from '../../lib/api';
import type { Income } from '../../lib/api-types';
import { PAYMENT_METHOD_LABELS } from '../../lib/finance-labels';
import { dateToIsoEnd, dateToIsoStart, isoToDateInput } from '../../lib/stock-labels';
import { Can } from '../can';
import { DataTable, type Column } from '../common/data-table';
import { PageHeader } from '../common/page-header';
import { PaginationBar } from '../common/pagination-bar';

const LIST_CONFIG = { filterKeys: ['from', 'to'] as const };

/** Satış dışı gelirler (kira geliri, hurda satışı vb.). */
export function IncomeList(): ReactElement {
  const { params, setPage, setLimit, setFilter, reset } = useListParams(LIST_CONFIG);
  const incomes = useIncomes(params);
  usePageClamp(incomes.data?.meta, setPage);
  const createIncome = useCreateIncome();
  const toast = useToast();
  const [open, setOpen] = useState(false);

  const columns = useMemo<Column<Income>[]>(
    () => [
      {
        key: 'incomeDate',
        header: 'Tarih',
        fixed: true,
        cell: (income) => <span className="tabular">{formatDate(income.incomeDate)}</span>,
      },
      { key: 'description', header: 'Açıklama', cell: (income) => income.description },
      {
        key: 'paymentMethod',
        header: 'Yöntem',
        cell: (income) => PAYMENT_METHOD_LABELS[income.paymentMethod],
      },
      {
        key: 'documentNo',
        header: 'Belge no',
        cell: (income) => <span className="tabular">{income.documentNo ?? '—'}</span>,
      },
      {
        key: 'amount',
        header: 'Tutar',
        numeric: true,
        cell: (income) => (
          <span className="text-success font-medium">{formatMoney(income.amount)}</span>
        ),
      },
    ],
    [],
  );

  const hasFilters = Object.values(params.filters).some(Boolean);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Finans"
        description="İşletme gider ve gelirleri, kasa vardiyaları."
        actions={
          <Can permission={PERMISSIONS.INCOME_MANAGE}>
            <Button
              onClick={() => {
                setOpen(true);
              }}
            >
              <Plus aria-hidden />
              Gelir ekle
            </Button>
          </Can>
        }
      />
      <FinanceTabs />

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink font-medium">Başlangıç</span>
          <Input
            type="date"
            className="w-40"
            value={isoToDateInput(params.filters.from)}
            onChange={(e) => {
              setFilter('from', dateToIsoStart(e.target.value) ?? '');
            }}
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink font-medium">Bitiş</span>
          <Input
            type="date"
            className="w-40"
            value={isoToDateInput(params.filters.to)}
            onChange={(e) => {
              setFilter('to', dateToIsoEnd(e.target.value) ?? '');
            }}
          />
        </label>

        {hasFilters ? (
          <Button variant="ghost" onClick={reset}>
            Filtreleri temizle
          </Button>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        rows={incomes.data?.items ?? []}
        rowKey={(income) => income.id}
        loading={incomes.isPending}
        error={incomes.isError ? apiErrorMessage(incomes.error) : null}
        onRetry={() => {
          void incomes.refetch();
        }}
        empty={
          <EmptyState
            icon={TrendingUp}
            title="Gelir kaydı yok"
            description="Satış dışı gelirleri (kira, hurda, iade vb.) buraya işleyin."
          />
        }
      />

      <PaginationBar meta={incomes.data?.meta} onPageChange={setPage} onLimitChange={setLimit} />

      <EntryDialog
        kind="income"
        open={open}
        loading={createIncome.isPending}
        error={createIncome.error}
        onClose={() => {
          setOpen(false);
        }}
        onSubmit={(values) => {
          createIncome.mutate(
            {
              amount: values.amount,
              paymentMethod: values.paymentMethod,
              description: values.description,
              incomeDate: new Date(`${values.date}T00:00:00`).toISOString(),
              ...(values.documentNo ? { documentNo: values.documentNo } : {}),
            },
            {
              onSuccess: () => {
                toast.success('Gelir kaydedildi', formatMoney(values.amount));
                setOpen(false);
              },
            },
          );
        }}
      />
    </div>
  );
}
