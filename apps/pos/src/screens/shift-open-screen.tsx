import type { CashSession, PosConfig } from '@shared/ipc-contracts';
import { useState, type FormEvent, type ReactElement } from 'react';

import { Button, Field, Input, formatMoney } from '@stokk/ui';


import { ScreenShell } from '../components/screen-shell';
import { bridge, errorMessage, unwrap } from '../lib/bridge';

interface ShiftOpenScreenProps {
  config: PosConfig;
  onOpened: (session: CashSession) => void;
  onChangeRegister: () => void;
}

/**
 * Vardiya açılışı.
 *
 * Bu ekrana YALNIZ açık vardiya olmadığı bilindiğinde gelinir (sorgunun sahibi
 * `app.tsx`). Yine de araya başka bir kasiyer girip vardiyayı açmış olabilir:
 * sunucu 409 döndüğünde kasiyeri hata mesajıyla çıkmazda bırakmak yerine
 * devralma yolu açılır.
 */
export function ShiftOpenScreen({
  config,
  onOpened,
  onChangeRegister,
}: ShiftOpenScreenProps): ReactElement {
  const [openingAmount, setOpeningAmount] = useState('0.00');
  const [existing, setExisting] = useState<CashSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!config.registerId) return;
    setBusy(true);
    setError(null);
    try {
      onOpened(await unwrap(bridge().shift.open({ registerId: config.registerId, openingAmount })));
    } catch (cause) {
      setError(errorMessage(cause, 'Vardiya açılamadı.'));
      // Bu arada başka bir kasiyer vardiyayı açmış olabilir: hatayı gösterip
      // kullanıcıyı çıkmazda bırakmak yerine devralma yolunu aç.
      try {
        const current = await unwrap(bridge().shift.current());
        if (current) setExisting(current);
      } catch {
        // sorulamıyorsa yukarıdaki hata mesajı yeterli
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenShell
      title="Vardiya açılışı"
      description={config.registerName ?? 'Seçili kasa'}
      step={{ current: 4, total: 4 }}
      footer={
        <Button variant="link" size="sm" className="px-0" onClick={onChangeRegister}>
          Kasa değiştir
        </Button>
      }
    >
      {existing ? (
        <div className="flex flex-col gap-4">
          <p className="text-ink text-sm">
            Bu kasada açık bir vardiya var. Açılış tutarı{' '}
            <strong>{formatMoney(existing.openingAmount)}</strong>.
          </p>
          <Button size="lg" onClick={() => onOpened(existing)}>
            Vardiyayı devral
          </Button>
        </div>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={(event) => void handleSubmit(event)}>
          <Field
            label="Kasada bulunan nakit"
            required
            error={error ?? undefined}
            hint="Vardiya sonunda sayım bu tutara göre karşılaştırılır."
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                inputMode="decimal"
                autoFocus
                aria-describedby={describedBy}
                value={openingAmount}
                onChange={(event) => setOpeningAmount(event.target.value)}
              />
            )}
          </Field>
          <Button type="submit" size="lg" loading={busy}>
            Vardiyayı aç
          </Button>
        </form>
      )}

      {error && existing ? (
        <p className="text-danger text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </ScreenShell>
  );
}
