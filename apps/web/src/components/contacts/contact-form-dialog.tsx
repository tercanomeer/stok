'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';

import { Button, Dialog, Field, Input, Select, Textarea, useToast } from '@stokk/ui';

import { useSaveContact, type ContactPayload } from '../../hooks/use-contacts';
import { apiErrorMessage } from '../../lib/api';
import type { Contact } from '../../lib/api-types';
import { CONTACT_TYPE_LABELS } from '../../lib/finance-labels';
import { contactSchema, type ContactOutput, type ContactValues } from '../../lib/finance-schemas';
import { FormBanner } from '../form-banner';

export interface ContactFormDialogProps {
  /** `null` = yeni cari, `undefined` = kapalı, kayıt = düzenleme. */
  contact: Contact | null | undefined;
  onClose: () => void;
}

function toDefaults(contact: Contact | null | undefined): ContactValues {
  return {
    type: contact?.type ?? 'CUSTOMER',
    name: contact?.name ?? '',
    code: contact?.code ?? '',
    taxNumber: contact?.taxNumber ?? '',
    taxOffice: contact?.taxOffice ?? '',
    phone: contact?.phone ?? '',
    email: contact?.email ?? '',
    address: contact?.address ?? '',
    creditLimit: contact?.creditLimit ?? '',
    note: '',
  };
}

/** Boş alan gönderilmez: backend `undefined` bekler, boş string'i reddeder. */
function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Cari ekleme / düzenleme. Kredi limiti veresiye riskinin eşiğidir, burada belirlenir. */
export function ContactFormDialog({ contact, onClose }: ContactFormDialogProps): ReactElement {
  const save = useSaveContact();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ContactValues, unknown, ContactOutput>({
    resolver: zodResolver(contactSchema),
    defaultValues: toDefaults(contact),
  });

  const open = contact !== undefined;

  useEffect(() => {
    if (open) {
      reset(toDefaults(contact));
      save.reset();
    }
    // Yalnız dialog açılışında/kayıt değişiminde sıfırlanır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contact?.id]);

  const onSubmit = handleSubmit((values) => {
    const payload: ContactPayload = {
      type: values.type,
      name: values.name,
      code: optional(values.code),
      taxNumber: optional(values.taxNumber),
      taxOffice: optional(values.taxOffice),
      phone: optional(values.phone),
      email: optional(values.email),
      address: optional(values.address),
      creditLimit: optional(values.creditLimit),
      note: optional(values.note),
    };
    save.mutate(
      { ...(contact ? { id: contact.id } : {}), payload },
      {
        onSuccess: () => {
          toast.success('Cari kaydedildi', values.name);
          onClose();
        },
      },
    );
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={contact ? 'Cariyi düzenle' : 'Yeni cari'}
      closeDisabled={save.isPending}
      className="w-[min(42rem,calc(100vw-2rem))]"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Vazgeç
          </Button>
          <Button
            loading={save.isPending}
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
        {save.isError ? <FormBanner message={apiErrorMessage(save.error)} /> : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Cari adı" required error={errors.name?.message} className="sm:col-span-2">
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

          <Field label="Cari türü" required error={errors.type?.message}>
            {({ id, describedBy }) => (
              <Select id={id} aria-describedby={describedBy} {...register('type')}>
                {Object.entries(CONTACT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Cari kodu" error={errors.code?.message}>
            {({ id, describedBy }) => (
              <Input id={id} aria-describedby={describedBy} {...register('code')} />
            )}
          </Field>

          <Field label="Vergi no / TCKN" error={errors.taxNumber?.message}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                inputMode="numeric"
                className="tabular"
                aria-describedby={describedBy}
                {...register('taxNumber')}
              />
            )}
          </Field>

          <Field label="Vergi dairesi" error={errors.taxOffice?.message}>
            {({ id, describedBy }) => (
              <Input id={id} aria-describedby={describedBy} {...register('taxOffice')} />
            )}
          </Field>

          <Field label="Telefon" error={errors.phone?.message}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                type="tel"
                className="tabular"
                aria-describedby={describedBy}
                {...register('phone')}
              />
            )}
          </Field>

          <Field label="E-posta" error={errors.email?.message}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                type="email"
                aria-describedby={describedBy}
                invalid={Boolean(errors.email)}
                {...register('email')}
              />
            )}
          </Field>

          <Field
            label="Veresiye limiti"
            error={errors.creditLimit?.message}
            hint="Boş veya 0 = limit yok. Aşan cariler veresiye defterinde işaretlenir."
            className="sm:col-span-2"
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                inputMode="decimal"
                className="tabular"
                aria-describedby={describedBy}
                invalid={Boolean(errors.creditLimit)}
                {...register('creditLimit')}
              />
            )}
          </Field>

          <Field label="Adres" error={errors.address?.message} className="sm:col-span-2">
            {({ id, describedBy }) => (
              <Textarea id={id} rows={2} aria-describedby={describedBy} {...register('address')} />
            )}
          </Field>
        </div>
      </div>
    </Dialog>
  );
}
