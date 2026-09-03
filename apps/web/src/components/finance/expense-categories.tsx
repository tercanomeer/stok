'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { FolderTree, Plus, Trash2 } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';

import { PERMISSIONS } from '@stokk/types';
import { Button, Dialog, EmptyState, Field, formatDate, Input, useToast } from '@stokk/ui';

import { FinanceTabs } from './finance-tabs';
import {
  useCreateExpenseCategory,
  useDeleteExpenseCategory,
  useExpenseCategories,
} from '../../hooks/use-finance';
import { apiErrorMessage } from '../../lib/api';
import type { ExpenseCategory } from '../../lib/api-types';
import { expenseCategorySchema, type ExpenseCategoryValues } from '../../lib/finance-schemas';
import { Can } from '../can';
import { ConfirmDialog } from '../common/confirm-dialog';
import { DataTable, type Column } from '../common/data-table';
import { PageHeader } from '../common/page-header';
import { FormBanner } from '../form-banner';

/**
 * Gider kategorileri. Kullanımdaki kategori silinemez (sunucu 409 döner) —
 * geçmiş gider kayıtlarının kategorisi kaybolmasın.
 */
export function ExpenseCategories(): ReactElement {
  const categories = useExpenseCategories();
  const createCategory = useCreateExpenseCategory();
  const deleteCategory = useDeleteExpenseCategory();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ExpenseCategory | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ExpenseCategoryValues>({
    resolver: zodResolver(expenseCategorySchema),
    defaultValues: { name: '' },
  });

  const onSubmit = handleSubmit((values) => {
    createCategory.mutate(values, {
      onSuccess: () => {
        toast.success('Kategori eklendi', values.name);
        setOpen(false);
      },
    });
  });

  const columns: Column<ExpenseCategory>[] = [
    { key: 'name', header: 'Kategori', fixed: true, cell: (row) => row.name },
    {
      key: 'createdAt',
      header: 'Eklendi',
      cell: (row) => <span className="tabular">{formatDate(row.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: 'İşlem',
      className: 'w-20 text-right',
      cell: (row) => (
        <Can permission={PERMISSIONS.EXPENSE_MANAGE}>
          <button
            type="button"
            aria-label={`${row.name} kategorisini sil`}
            onClick={() => {
              setPendingDelete(row);
            }}
            className="rounded-control text-ink-muted hover:bg-danger-weak hover:text-danger inline-flex size-8 items-center justify-center"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </Can>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Finans"
        description="İşletme gider ve gelirleri, kasa vardiyaları."
        actions={
          <Can permission={PERMISSIONS.EXPENSE_MANAGE}>
            <Button
              onClick={() => {
                reset({ name: '' });
                createCategory.reset();
                setOpen(true);
              }}
            >
              <Plus aria-hidden />
              Yeni kategori
            </Button>
          </Can>
        }
      />
      <FinanceTabs />

      <DataTable
        columns={columns}
        rows={categories.data ?? []}
        rowKey={(row) => row.id}
        loading={categories.isPending}
        error={categories.isError ? apiErrorMessage(categories.error) : null}
        onRetry={() => {
          void categories.refetch();
        }}
        empty={
          <EmptyState
            icon={FolderTree}
            title="Kategori yok"
            description="Giderleri gruplamak için kira, elektrik, personel gibi kategoriler ekleyin."
          />
        }
      />

      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title="Yeni gider kategorisi"
        closeDisabled={createCategory.isPending}
        footer={
          <>
            <Button
              variant="outline"
              disabled={createCategory.isPending}
              onClick={() => {
                setOpen(false);
              }}
            >
              Vazgeç
            </Button>
            <Button
              loading={createCategory.isPending}
              onClick={() => {
                void onSubmit();
              }}
            >
              Kaydet
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {createCategory.isError ? (
            <FormBanner message={apiErrorMessage(createCategory.error)} />
          ) : null}
          <Field label="Kategori adı" required error={errors.name?.message}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                autoFocus
                aria-describedby={describedBy}
                invalid={Boolean(errors.name)}
                {...register('name')}
              />
            )}
          </Field>
        </div>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Kategoriyi sil"
        description={`"${pendingDelete?.name ?? ''}" silinecek. Bu kategoride gider kaydı varsa silme reddedilir.`}
        confirmLabel="Sil"
        destructive
        loading={deleteCategory.isPending}
        onConfirm={() => {
          if (!pendingDelete) return;
          const name = pendingDelete.name;
          deleteCategory.mutate(pendingDelete.id, {
            onSuccess: () => {
              toast.success('Kategori silindi', name);
              setPendingDelete(null);
            },
            onError: (error) => {
              toast.error('Kategori silinemedi', apiErrorMessage(error));
            },
          });
        }}
        onClose={() => {
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
