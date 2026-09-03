'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';

import { Button, Dialog, Field, formatQuantity, Input, Textarea, useToast } from '@stokk/ui';

import { useAdjustStock } from '../../hooks/use-stock';
import { apiErrorMessage } from '../../lib/api';
import type { Product } from '../../lib/api-types';
import { adjustSchema, type AdjustOutput, type AdjustValues } from '../../lib/catalog-schemas';
import { FormBanner } from '../form-banner';

export interface AdjustDialogProps {
  product: Product | null;
  unitAbbreviation: string;
  onClose: () => void;
}

/**
 * Manuel stok düzeltme — DOĞRU miktar girilir, farkı sunucu hesaplar
 * (fark girmek yanlış işaret hatasına açık). Sebep zorunlu.
 */
export function AdjustDialog({
  product,
  unitAbbreviation,
  onClose,
}: AdjustDialogProps): ReactElement {
  const adjust = useAdjustStock();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AdjustValues, unknown, AdjustOutput>({
    resolver: zodResolver(adjustSchema),
    defaultValues: { newQuantity: '', reason: '' },
  });

  useEffect(() => {
    if (product) {
      reset({ newQuantity: product.stockQuantity, reason: '' });
      adjust.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  const onSubmit = handleSubmit((values) => {
    if (!product) return;
    adjust.mutate(
      { productId: product.id, newQuantity: values.newQuantity, reason: values.reason },
      {
        onSuccess: () => {
          toast.success('Stok düzeltildi', product.name);
          onClose();
        },
      },
    );
  });

  return (
    <Dialog
      open={product !== null}
      onClose={onClose}
      title="Stok düzelt"
      description={product ? `${product.name} — sayılan doğru miktarı yazın.` : undefined}
      closeDisabled={adjust.isPending}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={adjust.isPending}>
            Vazgeç
          </Button>
          <Button
            loading={adjust.isPending}
            onClick={() => {
              void onSubmit();
            }}
          >
            Düzeltmeyi kaydet
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {adjust.isError ? <FormBanner message={apiErrorMessage(adjust.error)} /> : null}

        <p className="text-ink-muted text-sm">
          Sistemdeki stok:{' '}
          <span className="text-ink tabular font-medium">
            {product ? formatQuantity(product.stockQuantity) : '—'} {unitAbbreviation}
          </span>
        </p>

        <Field
          label="Doğru miktar"
          required
          error={errors.newQuantity?.message}
          hint="Fark değil, olması gereken miktar."
        >
          {({ id, describedBy }) => (
            <Input
              id={id}
              autoFocus
              inputMode="decimal"
              className="tabular"
              aria-describedby={describedBy}
              invalid={Boolean(errors.newQuantity)}
              {...register('newQuantity')}
            />
          )}
        </Field>

        <Field
          label="Sebep"
          required
          error={errors.reason?.message}
          hint="Örnek: raf sayımı, giriş hatası düzeltmesi."
        >
          {({ id, describedBy }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              invalid={Boolean(errors.reason)}
              {...register('reason')}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}
