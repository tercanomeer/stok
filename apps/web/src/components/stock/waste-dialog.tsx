'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';

import { Button, Dialog, Field, formatQuantity, Input, Textarea, useToast } from '@stokk/ui';

import { useRecordWaste } from '../../hooks/use-stock';
import { apiErrorMessage } from '../../lib/api';
import type { Product } from '../../lib/api-types';
import { wasteSchema, type WasteOutput, type WasteValues } from '../../lib/catalog-schemas';
import { FormBanner } from '../form-banner';

export interface WasteDialogProps {
  product: Product | null;
  unitAbbreviation: string;
  onClose: () => void;
}

/**
 * Fire kaydı — bozulan/kırılan mal stoktan DÜŞÜLÜR ve sebebi zorunlu yazılır.
 * Sebep denetim izinin tek kanıtı olduğu için hem burada hem sunucuda zorunludur.
 */
export function WasteDialog({
  product,
  unitAbbreviation,
  onClose,
}: WasteDialogProps): ReactElement {
  const waste = useRecordWaste();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<WasteValues, unknown, WasteOutput>({
    resolver: zodResolver(wasteSchema),
    defaultValues: { quantity: '', reason: '' },
  });

  useEffect(() => {
    if (product) {
      reset({ quantity: '', reason: '' });
      waste.reset();
    }
    // Yalnız ürün değişince sıfırlanır; mutasyon nesnesi bağımlılığa girerse döngü olur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  const onSubmit = handleSubmit((values) => {
    if (!product) return;
    waste.mutate(
      { productId: product.id, quantity: values.quantity, reason: values.reason },
      {
        onSuccess: () => {
          toast.success('Fire kaydedildi', product.name);
          onClose();
        },
      },
    );
  });

  return (
    <Dialog
      open={product !== null}
      onClose={onClose}
      title="Fire kaydet"
      description={product ? `${product.name} — stoktan düşülecek.` : undefined}
      closeDisabled={waste.isPending}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={waste.isPending}>
            Vazgeç
          </Button>
          <Button
            variant="danger"
            loading={waste.isPending}
            onClick={() => {
              void onSubmit();
            }}
          >
            Fire kaydet
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {waste.isError ? <FormBanner message={apiErrorMessage(waste.error)} /> : null}

        <p className="text-ink-muted text-sm">
          Mevcut stok:{' '}
          <span className="text-ink tabular font-medium">
            {product ? formatQuantity(product.stockQuantity) : '—'} {unitAbbreviation}
          </span>
        </p>

        <Field label="Fire miktarı" required error={errors.quantity?.message}>
          {({ id, describedBy }) => (
            <Input
              id={id}
              autoFocus
              inputMode="decimal"
              className="tabular"
              aria-describedby={describedBy}
              invalid={Boolean(errors.quantity)}
              {...register('quantity')}
            />
          )}
        </Field>

        <Field
          label="Sebep"
          required
          error={errors.reason?.message}
          hint="Örnek: son kullanma tarihi geçti, kırıldı, bozuldu."
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
