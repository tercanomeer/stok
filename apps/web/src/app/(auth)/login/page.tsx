'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useForm } from 'react-hook-form';

import { Button, Field, Input } from '@stokk/ui';

import { FormBanner } from '../../../components/form-banner';
import { useLogin } from '../../../hooks/use-auth';
import { apiErrorMessage } from '../../../lib/api';
import { loginSchema, type LoginValues } from '../../../lib/auth-schemas';

export default function LoginPage(): React.JSX.Element {
  const login = useLogin();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit((values) => {
    login.mutate(values);
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-ink text-2xl font-semibold tracking-tight">Giriş yap</h1>
        <p className="text-ink-muted text-sm">Hesabınıza girip panele ulaşın.</p>
      </div>

      <form
        onSubmit={(e) => {
          void onSubmit(e);
        }}
        noValidate
        className="space-y-4"
      >
        {login.isError ? <FormBanner message={apiErrorMessage(login.error)} /> : null}

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

        <Field label="Şifre" required error={errors.password?.message}>
          {({ id, describedBy }) => (
            <Input
              id={id}
              type="password"
              autoComplete="current-password"
              aria-describedby={describedBy}
              invalid={Boolean(errors.password)}
              {...register('password')}
            />
          )}
        </Field>

        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-brand text-sm hover:underline">
            Şifremi unuttum
          </Link>
        </div>

        <Button type="submit" className="w-full" loading={login.isPending}>
          Giriş yap
        </Button>
      </form>

      <p className="text-ink-muted text-center text-sm">
        İşletmen yok mu?{' '}
        <Link href="/register" className="text-brand font-medium hover:underline">
          İşletme oluştur
        </Link>
      </p>
    </div>
  );
}
