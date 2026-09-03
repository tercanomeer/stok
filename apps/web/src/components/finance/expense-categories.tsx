'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { FolderTree, PencilLine, Plus, Trash2 } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';

import { PERMISSIONS } from '@stokk/types';
import { Button, Dialog, EmptyState, Field, formatDate, Input, useToast } from '@stokk/ui';

import { FinanceTabs } from './finance-tabs';
import {
  useCreateExpenseCategory,
  useDeleteExpenseCategory,
  useExpenseCategories,
  useUpdateExpenseCategory,
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
  const updateCategory = useUpdateExpenseCategory();
  const deleteCategory = useDeleteExpenseCategory();
  const toast = useToast();
  // `null` = yeni kategori, kayıt = düzenleme, `undefined` = kapalı.
  const [editing, setEditing] = useState<ExpenseCategory | null | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<ExpenseCategory | null>(null);
  const saving = editing ? updateCategory.isPending : createCategory.isPending;
  const saveError = editing ? updateCategory.error : createCategory.error;

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
    if (editing) {
      updateCategory.mutate(
        { id: editing.id, name: values.name },
        {
          onSuccess: () => {
            toast.success('Kategori güncellendi', values.name);
            setEditing(undefined);
          },
        },
      );
      return;
    }
    createCategory.mutate(values, {
      onSuccess: () => {
        toast.success('Kategori eklendi', values.name);
        setEditing(undefined);
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
      className: 'w-24 text-right',
      cell: (row) => (
        <Can permission={PERMISSIONS.EXPENSE_MANAGE}>
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              aria-label={`${row.name} kategorisini düzenle`}
              onClick={() => {
                reset({ name: row.name });
                updateCategory.reset();
                setEditing(row);
              }}
              className="rounded-control text-ink-muted hover:bg-surface-sunken hover:text-ink inline-flex size-8 items-center justify-center"
            >
              <PencilLine className="size-4" aria-hidden />
            </button>
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
          </div>
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
                setEditing(null);
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
        open={editing !== undefined}
        onClose={() => {
          setEditing(undefined);
        }}
        title={editing ? 'Kategoriyi düzenle' : 'Yeni gider kategorisi'}
        closeDisabled={saving}
        footer={
          <>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => {
                setEditing(undefined);
              }}
            >
              Vazgeç
            </Button>
            <Button
              loading={saving}
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
          {saveError ? <FormBanner message={apiErrorMessage(saveError)} /> : null}
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
