'use client';

import { PencilLine, Plus, Trash2, TrendingUp } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';
import { Button, EmptyState, formatDate, formatMoney, Input, useToast } from '@stokk/ui';

import { EntryDialog } from './entry-dialog';
import { FinanceTabs } from './finance-tabs';
import {
  useCreateIncome,
  useDeleteIncome,
  useIncomes,
  useUpdateIncome,
} from '../../hooks/use-finance';
import { useListParams } from '../../hooks/use-list-params';
import { usePageClamp } from '../../hooks/use-page-clamp';
import { apiErrorMessage } from '../../lib/api';
import type { Income } from '../../lib/api-types';
import { PAYMENT_METHOD_LABELS } from '../../lib/finance-labels';
import type { FinanceEntryValues } from '../../lib/finance-schemas';
import { usePermission } from '../../lib/permissions';
import { dateToIsoEnd, dateToIsoStart, isoToDateInput } from '../../lib/stock-labels';
import { Can } from '../can';
import { ConfirmDialog } from '../common/confirm-dialog';
import { DataTable, type Column } from '../common/data-table';
import { PageHeader } from '../common/page-header';
import { PaginationBar } from '../common/pagination-bar';

const LIST_CONFIG = { filterKeys: ['from', 'to'] as const };

/** Kayıttan form değerlerine — tarih `<input type="date">` biçimine indirilir. */
function toEntryValues(income: Income): FinanceEntryValues {
  const date = new Date(income.incomeDate);
  const offset = date.getTimezoneOffset() * 60_000;
  return {
    amount: income.amount,
    paymentMethod: income.paymentMethod,
    description: income.description,
    date: new Date(date.getTime() - offset).toISOString().slice(0, 10),
    categoryId: '',
    documentNo: income.documentNo ?? '',
  };
}

/** Satış dışı gelirler (kira geliri, hurda satışı vb.). */
export function IncomeList(): ReactElement {
  const { params, setPage, setLimit, setFilter, reset } = useListParams(LIST_CONFIG);
  const incomes = useIncomes(params);
  usePageClamp(incomes.data?.meta, setPage);
  const createIncome = useCreateIncome();
  const updateIncome = useUpdateIncome();
  const deleteIncome = useDeleteIncome();
  const toast = useToast();
  const canManage = usePermission(PERMISSIONS.INCOME_MANAGE);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Income | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Income | null>(null);

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
      ...(canManage
        ? [
            {
              key: 'actions',
              header: 'İşlem',
              className: 'w-24',
              cell: (income: Income) => (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={`${income.description} gelirini düzenle`}
                    onClick={() => {
                      setEditing(income);
                    }}
                    className="rounded-control text-ink-muted hover:bg-surface-sunken hover:text-ink inline-flex size-8 items-center justify-center"
                  >
                    <PencilLine className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`${income.description} gelirini sil`}
                    onClick={() => {
                      setPendingDelete(income);
                    }}
                    className="rounded-control text-ink-muted hover:bg-danger-weak hover:text-danger inline-flex size-8 items-center justify-center"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              ),
            } satisfies Column<Income>,
          ]
        : []),
    ],
    [canManage],
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
        open={editing !== null}
        initial={editing ? toEntryValues(editing) : null}
        loading={updateIncome.isPending}
        error={updateIncome.error}
        onClose={() => {
          setEditing(null);
        }}
        onSubmit={(values) => {
          if (!editing) return;
          updateIncome.mutate(
            {
              id: editing.id,
              body: {
                amount: values.amount,
                paymentMethod: values.paymentMethod,
                description: values.description,
                incomeDate: new Date(`${values.date}T00:00:00`).toISOString(),
                documentNo: values.documentNo ? values.documentNo : null,
              },
            },
            {
              onSuccess: () => {
                toast.success('Gelir güncellendi', formatMoney(values.amount));
                setEditing(null);
              },
              onError: (error) => {
                toast.error('Gelir güncellenemedi', apiErrorMessage(error));
              },
            },
          );
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Geliri sil"
        description={`"${pendingDelete?.description ?? ''}" (${formatMoney(pendingDelete?.amount ?? '0')}) silinecek. Kayıt listeden düşer, mali geçmişte korunur.`}
        confirmLabel="Sil"
        destructive
        loading={deleteIncome.isPending}
        onConfirm={() => {
          if (!pendingDelete) return;
          const label = pendingDelete.description;
          deleteIncome.mutate(pendingDelete.id, {
            onSuccess: () => {
              toast.success('Gelir silindi', label);
              setPendingDelete(null);
            },
            onError: (error) => {
              toast.error('Gelir silinemedi', apiErrorMessage(error));
            },
          });
        }}
        onClose={() => {
          setPendingDelete(null);
        }}
      />

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
