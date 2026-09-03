'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, type ReactElement } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { Button, Dialog, Field, formatMoney, Input, Select, Textarea, useToast } from '@stokk/ui';

import { useRecordPayment } from '../../hooks/use-contacts';
import { apiErrorMessage } from '../../lib/api';
import type { Contact } from '../../lib/api-types';
import { balanceView } from '../../lib/contact-balance';
import { PAYMENT_METHOD_LABELS } from '../../lib/finance-labels';
import { paymentSchema, type PaymentOutput, type PaymentValues } from '../../lib/finance-schemas';
import { FormBanner } from '../form-banner';

export interface PaymentDialogProps {
  contact: Contact | null;
  onClose: () => void;
}

/** Tedarikçiden alışta borç bizde olur; varsayılan yön cari türüne göre seçilir. */
function defaultDirection(contact: Contact | null): 'collect' | 'pay' {
  return contact?.type === 'SUPPLIER' ? 'pay' : 'collect';
}

/**
 * Tahsilat (müşteriden) / ödeme (tedarikçiye). Tutar POZİTİF girilir; işaret yönden gelir.
 * Kayıt sonrası bakiye, ekstre ve yaşlandırma birlikte tazelenir (hepsi aynı hareketten türer).
 */
export function PaymentDialog({ contact, onClose }: PaymentDialogProps): ReactElement {
  const payment = useRecordPayment();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<PaymentValues, unknown, PaymentOutput>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { direction: 'collect', amount: '', method: 'CASH', description: '' },
  });

  const direction = useWatch({ control, name: 'direction' });

  useEffect(() => {
    if (contact) {
      reset({
        direction: defaultDirection(contact),
        amount: '',
        method: 'CASH',
        description: '',
      });
      payment.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact?.id]);

  const onSubmit = handleSubmit((values) => {
    if (!contact) return;
    payment.mutate(
      {
        contactId: contact.id,
        direction: values.direction,
        amount: values.amount,
        method: values.method,
        ...(values.description ? { description: values.description } : {}),
      },
      {
        onSuccess: () => {
          toast.success(
            values.direction === 'collect' ? 'Tahsilat kaydedildi' : 'Ödeme kaydedildi',
            `${formatMoney(values.amount)} · ${contact.name}`,
          );
          onClose();
        },
      },
    );
  });

  const view = contact ? balanceView(contact.balance) : null;

  return (
    <Dialog
      open={contact !== null}
      onClose={onClose}
      title={direction === 'collect' ? 'Tahsilat' : 'Ödeme'}
      description={contact?.name}
      closeDisabled={payment.isPending}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={payment.isPending}>
            Vazgeç
          </Button>
          <Button
            loading={payment.isPending}
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
        {payment.isError ? <FormBanner message={apiErrorMessage(payment.error)} /> : null}

        {view ? (
          <p className="text-ink-muted text-sm">
            Güncel bakiye:{' '}
            <span className="text-ink tabular font-medium">
              {view.direction === 'settled' ? 'Hesap kapalı' : formatMoney(view.amount)}
            </span>
            {view.direction === 'settled' ? '' : ` · ${view.label}`}
          </p>
        ) : null}

        <Field label="İşlem" required error={errors.direction?.message}>
          {({ id, describedBy }) => (
            <Select id={id} aria-describedby={describedBy} {...register('direction')}>
              <option value="collect">Tahsilat — müşteriden para aldık</option>
              <option value="pay">Ödeme — tedarikçiye para verdik</option>
            </Select>
          )}
        </Field>

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

        <Field label="Ödeme yöntemi" required error={errors.method?.message}>
          {({ id, describedBy }) => (
            <Select id={id} aria-describedby={describedBy} {...register('method')}>
              <option value="CASH">{PAYMENT_METHOD_LABELS.CASH}</option>
              <option value="CARD">{PAYMENT_METHOD_LABELS.CARD}</option>
              <option value="TRANSFER">{PAYMENT_METHOD_LABELS.TRANSFER}</option>
            </Select>
          )}
        </Field>

        <Field label="Açıklama" error={errors.description?.message}>
          {({ id, describedBy }) => (
            <Textarea
              id={id}
              rows={2}
              aria-describedby={describedBy}
              {...register('description')}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}
