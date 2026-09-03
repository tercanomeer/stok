'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';

import { Button, Dialog, Field, Input, Select, useToast } from '@stokk/ui';

import { useExpenseCategories } from '../../hooks/use-finance';
import { apiErrorMessage } from '../../lib/api';
import { PAYMENT_METHOD_LABELS } from '../../lib/finance-labels';
import {
  financeEntrySchema,
  type FinanceEntryOutput,
  type FinanceEntryValues,
} from '../../lib/finance-schemas';
import { FormBanner } from '../form-banner';

export interface EntryDialogProps {
  kind: 'expense' | 'income';
  open: boolean;
  onClose: () => void;
  loading: boolean;
  error: Error | null;
  onSubmit: (values: FinanceEntryOutput) => void;
}

function today(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function emptyEntry(): FinanceEntryValues {
  return {
    amount: '',
    paymentMethod: 'CASH',
    description: '',
    date: today(),
    categoryId: '',
    documentNo: '',
  };
}

/**
 * Gelir ve gider aynı formu paylaşır: tek fark gider kategorisi alanı ve metinler.
 * Gelirde kategori yok (backend `createIncomeSchema` kategori almıyor).
 */
export function EntryDialog({
  kind,
  open,
  onClose,
  loading,
  error,
  onSubmit,
}: EntryDialogProps): ReactElement {
  const isExpense = kind === 'expense';
  const categories = useExpenseCategories(isExpense);
  const toast = useToast();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FinanceEntryValues, unknown, FinanceEntryOutput>({
    resolver: zodResolver(financeEntrySchema),
    defaultValues: emptyEntry(),
  });

  useEffect(() => {
    if (open) reset(emptyEntry());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = handleSubmit(
    (values) => {
      onSubmit(values);
    },
    () => {
      toast.error('Form eksik', 'Zorunlu alanları doldurun.');
    },
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isExpense ? 'Gider ekle' : 'Gelir ekle'}
      closeDisabled={loading}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Vazgeç
          </Button>
          <Button
            loading={loading}
            onClick={() => {
              void submit();
            }}
          >
            Kaydet
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <FormBanner message={apiErrorMessage(error)} /> : null}

        <Field label="Tutar" required error={errors.amount?.message} hint="Örnek: 1.250,00">
          {({ id, describedBy }) => (
            <Input
              id={id}
              autoFocus
              inputMode="decimal"
              className="tabular"
              aria-describedby={describedBy}
              invalid={Boolean(errors.amount)}
              {...register('amount')}
            />
          )}
        </Field>

        <Field label="Açıklama" required error={errors.description?.message}>
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              invalid={Boolean(errors.description)}
              {...register('description')}
            />
          )}
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tarih" required error={errors.date?.message}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                type="date"
                aria-describedby={describedBy}
                invalid={Boolean(errors.date)}
                {...register('date')}
              />
            )}
          </Field>

          <Field label="Ödeme yöntemi" required error={errors.paymentMethod?.message}>
            {({ id, describedBy }) => (
              <Select id={id} aria-describedby={describedBy} {...register('paymentMethod')}>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {isExpense ? (
            <Field label="Kategori" error={errors.categoryId?.message}>
              {({ id, describedBy }) => (
                <Select id={id} aria-describedby={describedBy} {...register('categoryId')}>
                  <option value="">Kategorisiz</option>
                  {(categories.data ?? []).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : null}

          <Field label="Belge no" error={errors.documentNo?.message}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                className="tabular"
                aria-describedby={describedBy}
                {...register('documentNo')}
              />
            )}
          </Field>
        </div>
      </div>
    </Dialog>
  );
}
