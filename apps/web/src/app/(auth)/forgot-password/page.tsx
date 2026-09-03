'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';

import { Button, Field, Input } from '@stokk/ui';

import { FormBanner } from '../../../components/form-banner';
import { useForgotPassword } from '../../../hooks/use-auth';
import { apiErrorMessage } from '../../../lib/api';
import { forgotPasswordSchema, type ForgotPasswordValues } from '../../../lib/auth-schemas';

export default function ForgotPasswordPage(): React.JSX.Element {
  const forgot = useForgotPassword();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordValues>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = handleSubmit((values) => {
    forgot.mutate(values);
  });

  // Yanıt her durumda 204 — kullanıcı varlığı sızmasın diye başarı mesajı nötr.
  if (forgot.isSuccess) {
    return (
      <div className="space-y-6 text-center">
        <MailCheck className="text-success mx-auto size-10" aria-hidden />
        <div className="space-y-1">
          <h1 className="text-ink text-xl font-semibold">E-postanızı kontrol edin</h1>
          <p className="text-ink-muted text-sm">
            Adres kayıtlıysa şifre sıfırlama bağlantısı gönderdik.
          </p>
        </div>
        <Link href="/login" className="text-brand text-sm font-medium hover:underline">
          Girişe dön
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-ink text-2xl font-semibold tracking-tight">Şifremi unuttum</h1>
        <p className="text-ink-muted text-sm">
          E-posta adresinizi girin, sıfırlama bağlantısı gönderelim.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          void onSubmit(e);
        }}
        noValidate
        className="space-y-4"
      >
        {forgot.isError ? <FormBanner message={apiErrorMessage(forgot.error)} /> : null}

        <Field label="E-posta" required error={errors.email?.message}>
          {({ id, describedBy }) => (
            <Input
              id={id}
              type="email"
              autoComplete="email"
              autoFocus
              aria-describedby={describedBy}
              invalid={Boolean(errors.email)}
              {...register('email')}
            />
          )}
        </Field>

        <Button type="submit" className="w-full" loading={forgot.isPending}>
          Bağlantı gönder
        </Button>
      </form>

      <p className="text-ink-muted text-center text-sm">
        <Link href="/login" className="text-brand font-medium hover:underline">
          Girişe dön
        </Link>
      </p>
    </div>
  );
}
