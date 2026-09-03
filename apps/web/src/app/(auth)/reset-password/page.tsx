'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useForm } from 'react-hook-form';

import { Button, Field, Input } from '@stokk/ui';

import { FormBanner } from '../../../components/form-banner';
import { useResetPassword } from '../../../hooks/use-auth';
import { apiErrorMessage } from '../../../lib/api';
import { resetPasswordSchema, type ResetPasswordValues } from '../../../lib/auth-schemas';

function ResetForm(): React.JSX.Element {
  const token = useSearchParams().get('token') ?? '';
  const reset = useResetPassword();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordValues>({ resolver: zodResolver(resetPasswordSchema) });

  const onSubmit = handleSubmit((values) => {
    reset.mutate({ token, password: values.password });
  });

  if (reset.isSuccess) {
    return (
      <div className="space-y-6 text-center">
        <CheckCircle2 className="text-success mx-auto size-10" aria-hidden />
        <div className="space-y-1">
          <h1 className="text-ink text-xl font-semibold">Şifreniz güncellendi</h1>
          <p className="text-ink-muted text-sm">Yeni şifrenizle giriş yapabilirsiniz.</p>
        </div>
        <Link href="/login" className="text-brand text-sm font-medium hover:underline">
          Girişe git
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-ink text-2xl font-semibold tracking-tight">Yeni şifre belirle</h1>
        <p className="text-ink-muted text-sm">Hesabınız için yeni bir şifre girin.</p>
      </div>

      <form
        onSubmit={(e) => {
          void onSubmit(e);
        }}
        noValidate
        className="space-y-4"
      >
        {!token ? (
          <FormBanner message="Sıfırlama bağlantısı geçersiz veya eksik. Bağlantıyı e-postanızdan tekrar açın." />
        ) : null}
        {reset.isError ? <FormBanner message={apiErrorMessage(reset.error)} /> : null}

        <Field
          label="Yeni şifre"
          required
          hint="En az 8 karakter."
          error={errors.password?.message}
        >
          {({ id, describedBy }) => (
            <Input
              id={id}
              type="password"
              autoComplete="new-password"
              autoFocus
              aria-describedby={describedBy}
              invalid={Boolean(errors.password)}
              {...register('password')}
            />
          )}
        </Field>

        <Field label="Yeni şifre (tekrar)" required error={errors.passwordConfirm?.message}>
          {({ id, describedBy }) => (
            <Input
              id={id}
              type="password"
              autoComplete="new-password"
              aria-describedby={describedBy}
              invalid={Boolean(errors.passwordConfirm)}
              {...register('passwordConfirm')}
            />
          )}
        </Field>

        <Button type="submit" className="w-full" loading={reset.isPending} disabled={!token}>
          Şifreyi güncelle
        </Button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage(): React.JSX.Element {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}
