'use client';

import { PencilLine, Plus, Receipt, Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';
import {
  Badge,
  Button,
  EmptyState,
  formatDate,
  formatMoney,
  Input,
  Select,
  useToast,
} from '@stokk/ui';

import { EntryDialog } from './entry-dialog';
import { FinanceTabs } from './finance-tabs';
import {
  useCreateExpense,
  useDeleteExpense,
  useExpenseCategories,
  useExpenses,
  useUpdateExpense,
} from '../../hooks/use-finance';
import { useListParams } from '../../hooks/use-list-params';
import { usePageClamp } from '../../hooks/use-page-clamp';
import { apiErrorMessage } from '../../lib/api';
import type { Expense } from '../../lib/api-types';
import { PAYMENT_METHOD_LABELS } from '../../lib/finance-labels';
import type { FinanceEntryValues } from '../../lib/finance-schemas';
import { usePermission } from '../../lib/permissions';
import { dateToIsoEnd, dateToIsoStart, isoToDateInput } from '../../lib/stock-labels';
import { Can } from '../can';
import { ConfirmDialog } from '../common/confirm-dialog';
import { DataTable, type Column } from '../common/data-table';
import { PageHeader } from '../common/page-header';
import { PaginationBar } from '../common/pagination-bar';

const LIST_CONFIG = { filterKeys: ['categoryId', 'from', 'to'] as const };

/** Kayıttan form değerlerine — tarih `<input type="date">` biçimine indirilir. */
function toEntryValues(expense: Expense): FinanceEntryValues {
  const date = new Date(expense.expenseDate);
  const offset = date.getTimezoneOffset() * 60_000;
  return {
    amount: expense.amount,
    paymentMethod: expense.paymentMethod,
    description: expense.description,
    date: new Date(date.getTime() - offset).toISOString().slice(0, 10),
    categoryId: expense.category?.id ?? '',
    documentNo: expense.documentNo ?? '',
  };
}

/** Gider listesi — kategori ve tarih aralığı filtreli. */
export function ExpenseList(): ReactElement {
  const { params, setPage, setLimit, setFilter, reset } = useListParams(LIST_CONFIG);
  const expenses = useExpenses(params);
  usePageClamp(expenses.data?.meta, setPage);
  const categories = useExpenseCategories();
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();
  const toast = useToast();
  const canManage = usePermission(PERMISSIONS.EXPENSE_MANAGE);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Expense | null>(null);

  const columns = useMemo<Column<Expense>[]>(
    () => [
      {
        key: 'expenseDate',
        header: 'Tarih',
        fixed: true,
        cell: (expense) => <span className="tabular">{formatDate(expense.expenseDate)}</span>,
      },
      { key: 'description', header: 'Açıklama', cell: (expense) => expense.description },
      {
        key: 'category',
        header: 'Kategori',
        cell: (expense) =>
          expense.category ? <Badge tone="neutral">{expense.category.name}</Badge> : '—',
      },
      {
        key: 'paymentMethod',
        header: 'Yöntem',
        cell: (expense) => PAYMENT_METHOD_LABELS[expense.paymentMethod],
      },
      {
        key: 'documentNo',
        header: 'Belge no',
        cell: (expense) => <span className="tabular">{expense.documentNo ?? '—'}</span>,
      },
      {
        key: 'amount',
        header: 'Tutar',
        numeric: true,
        cell: (expense) => (
          <span className="text-danger font-medium">{formatMoney(expense.amount)}</span>
        ),
      },
      ...(canManage
        ? [
            {
              key: 'actions',
              header: 'İşlem',
              className: 'w-24',
              cell: (expense: Expense) => (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={`${expense.description} giderini düzenle`}
                    onClick={() => {
                      setEditing(expense);
                    }}
                    className="rounded-control text-ink-muted hover:bg-surface-sunken hover:text-ink inline-flex size-8 items-center justify-center"
                  >
                    <PencilLine className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`${expense.description} giderini sil`}
                    onClick={() => {
                      setPendingDelete(expense);
                    }}
                    className="rounded-control text-ink-muted hover:bg-danger-weak hover:text-danger inline-flex size-8 items-center justify-center"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              ),
            } satisfies Column<Expense>,
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
          <Can permission={PERMISSIONS.EXPENSE_MANAGE}>
            <Button
              onClick={() => {
                setOpen(true);
              }}
            >
              <Plus aria-hidden />
              Gider ekle
            </Button>
          </Can>
        }
      />
      <FinanceTabs />

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink font-medium">Kategori</span>
          <Select
            className="w-48"
            value={params.filters.categoryId ?? ''}
            onChange={(e) => {
              setFilter('categoryId', e.target.value);
            }}
          >
            <option value="">Tüm kategoriler</option>
            {(categories.data ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </label>

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
        rows={expenses.data?.items ?? []}
        rowKey={(expense) => expense.id}
        loading={expenses.isPending}
        error={expenses.isError ? apiErrorMessage(expenses.error) : null}
        onRetry={() => {
          void expenses.refetch();
        }}
        empty={
          <EmptyState
            icon={Receipt}
            title="Gider kaydı yok"
            description="Kira, elektrik, nakliye gibi işletme giderlerini buraya işleyin."
          />
        }
      />

      <PaginationBar meta={expenses.data?.meta} onPageChange={setPage} onLimitChange={setLimit} />

      <EntryDialog
        kind="expense"
        open={editing !== null}
        initial={editing ? toEntryValues(editing) : null}
        loading={updateExpense.isPending}
        error={updateExpense.error}
        onClose={() => {
          setEditing(null);
        }}
        onSubmit={(values) => {
          if (!editing) return;
          updateExpense.mutate(
            {
              id: editing.id,
              body: {
                amount: values.amount,
                paymentMethod: values.paymentMethod,
                description: values.description,
                expenseDate: new Date(`${values.date}T00:00:00`).toISOString(),
                categoryId: values.categoryId ? values.categoryId : null,
                documentNo: values.documentNo ? values.documentNo : null,
              },
            },
            {
              onSuccess: () => {
                toast.success('Gider güncellendi', formatMoney(values.amount));
                setEditing(null);
              },
              onError: (error) => {
                toast.error('Gider güncellenemedi', apiErrorMessage(error));
              },
            },
          );
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Gideri sil"
        description={`"${pendingDelete?.description ?? ''}" (${formatMoney(pendingDelete?.amount ?? '0')}) silinecek. Kayıt listeden düşer, mali geçmişte korunur.`}
        confirmLabel="Sil"
        destructive
        loading={deleteExpense.isPending}
        onConfirm={() => {
          if (!pendingDelete) return;
          const label = pendingDelete.description;
          deleteExpense.mutate(pendingDelete.id, {
            onSuccess: () => {
              toast.success('Gider silindi', label);
              setPendingDelete(null);
            },
            onError: (error) => {
              toast.error('Gider silinemedi', apiErrorMessage(error));
            },
          });
        }}
        onClose={() => {
          setPendingDelete(null);
        }}
      />

      <EntryDialog
        kind="expense"
        open={open}
        loading={createExpense.isPending}
        error={createExpense.error}
        onClose={() => {
          setOpen(false);
        }}
        onSubmit={(values) => {
          createExpense.mutate(
            {
              amount: values.amount,
              paymentMethod: values.paymentMethod,
              description: values.description,
              expenseDate: new Date(`${values.date}T00:00:00`).toISOString(),
              ...(values.categoryId ? { categoryId: values.categoryId } : {}),
              ...(values.documentNo ? { documentNo: values.documentNo } : {}),
            },
            {
              onSuccess: () => {
                toast.success('Gider kaydedildi', formatMoney(values.amount));
                setOpen(false);
              },
            },
          );
        }}
      />
    </div>
  );
}
