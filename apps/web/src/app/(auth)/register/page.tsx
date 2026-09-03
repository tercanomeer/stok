'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useForm } from 'react-hook-form';

import { Button, Field, Input } from '@stokk/ui';

import { FormBanner } from '../../../components/form-banner';
import { useRegister } from '../../../hooks/use-auth';
import { apiErrorMessage } from '../../../lib/api';
import { registerSchema, type RegisterValues } from '../../../lib/auth-schemas';

export default function RegisterPage(): React.JSX.Element {
  const registerMutation = useRegister();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });

  const onSubmit = handleSubmit(({ passwordConfirm: _confirm, ...values }) => {
    registerMutation.mutate(values);
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-ink text-2xl font-semibold tracking-tight">İşletme oluştur</h1>
        <p className="text-ink-muted text-sm">
          İşletmenizi kaydedin; ilk hesap patron olarak açılır.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          void onSubmit(e);
        }}
        noValidate
        className="space-y-4"
      >
        {registerMutation.isError ? (
          <FormBanner message={apiErrorMessage(registerMutation.error)} />
        ) : null}

        <Field label="İşletme adı" required error={errors.businessName?.message}>
          {({ id, describedBy }) => (
            <Input
              id={id}
              autoComplete="organization"
              autoFocus
              aria-describedby={describedBy}
              invalid={Boolean(errors.businessName)}
              {...register('businessName')}
            />
          )}
        </Field>

        <Field label="Ad soyad" required error={errors.fullName?.message}>
          {({ id, describedBy }) => (
            <Input
              id={id}
              autoComplete="name"
              aria-describedby={describedBy}
              invalid={Boolean(errors.fullName)}
              {...register('fullName')}
            />
          )}
        </Field>

        <Field label="E-posta" required error={errors.email?.message}>
          {({ id, describedBy }) => (
            <Input
              id={id}
              type="email"
              autoComplete="email"
              aria-describedby={describedBy}
              invalid={Boolean(errors.email)}
              {...register('email')}
            />
          )}
        </Field>

        <Field label="Şifre" required hint="En az 8 karakter." error={errors.password?.message}>
          {({ id, describedBy }) => (
            <Input
              id={id}
              type="password"
              autoComplete="new-password"
              aria-describedby={describedBy}
              invalid={Boolean(errors.password)}
              {...register('password')}
            />
          )}
        </Field>

        <Field label="Şifre (tekrar)" required error={errors.passwordConfirm?.message}>
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

        <Button type="submit" className="w-full" loading={registerMutation.isPending}>
          İşletme oluştur
        </Button>
      </form>

      <p className="text-ink-muted text-center text-sm">
        Zaten hesabın var mı?{' '}
        <Link href="/login" className="text-brand font-medium hover:underline">
          Giriş yap
        </Link>
      </p>
    </div>
  );
}
