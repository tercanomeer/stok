import type { NetworkStatus, PosSession } from '@shared/ipc-contracts';
import { WifiOff } from 'lucide-react';
import { useState, type FormEvent, type ReactElement } from 'react';

import { Button, Field, Input } from '@stokk/ui';


import { ScreenShell } from '../components/screen-shell';
import { bridge, errorMessage, unwrap } from '../lib/bridge';

interface LoginScreenProps {
  lastEmail: string | null;
  network: NetworkStatus;
  onLoggedIn: (session: PosSession) => void;
  onChangeServer: () => void;
}

export function LoginScreen({
  lastEmail,
  network,
  onLoggedIn,
  onChangeServer,
}: LoginScreenProps): ReactElement {
  const [email, setEmail] = useState(lastEmail ?? '');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session = await unwrap(
        bridge().auth.login({
          email,
          password,
          ...(totpCode.trim().length === 0 ? {} : { totpCode: totpCode.trim() }),
        }),
      );
      onLoggedIn(session);
    } catch (cause) {
      // Sunucu 2FA istediyse alanı aç ve parolayı KORU — kullanıcı baştan yazmasın.
      if (cause instanceof Error && cause.message.includes('Doğrulama kodu gerekli')) {
        setNeedsTotp(true);
        setError('Doğrulama kodunuzu girin.');
      } else {
        setError(errorMessage(cause, 'Giriş yapılamadı.'));
      }
    } finally {
      setBusy(false);
    }
  }

  const offline = network.state !== 'online';

  return (
    <ScreenShell
      title="Giriş"
      description="Kasa hesabınızla giriş yapın."
      step={{ current: 2, total: 4 }}
      footer={
        <Button variant="link" size="sm" className="px-0" onClick={onChangeServer}>
          Sunucu adresini değiştir
        </Button>
      }
    >
      {offline ? (
        <p
          className="bg-warning-weak text-warning rounded-control flex items-start gap-2 p-3 text-sm"
          role="status"
        >
          <WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Sunucuya ulaşılamıyor. Bu kasada daha önce giriş yaptıysanız çevrimdışı devam
            edebilirsiniz.
          </span>
        </p>
      ) : null}

      <form className="flex flex-col gap-4" onSubmit={(event) => void handleSubmit(event)}>
        <Field label="E-posta" required>
          {({ id }) => (
            <Input
              id={id}
              type="email"
              autoComplete="username"
              autoFocus={email.length === 0}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </Field>

        <Field label="Şifre" required error={error ?? undefined}>
          {({ id, describedBy }) => (
            <Input
              id={id}
              type="password"
              autoComplete="current-password"
              autoFocus={email.length > 0}
              aria-describedby={describedBy}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </Field>

        {needsTotp ? (
          <Field label="Doğrulama kodu" required hint="Uygulamanızdaki 6 haneli kod.">
            {({ id }) => (
              <Input
                id={id}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                value={totpCode}
                onChange={(event) => setTotpCode(event.target.value)}
              />
            )}
          </Field>
        ) : null}

        <Button
          type="submit"
          size="lg"
          loading={busy}
          disabled={email.trim().length === 0 || password.length === 0}
        >
          Giriş yap
        </Button>
      </form>
    </ScreenShell>
  );
}
