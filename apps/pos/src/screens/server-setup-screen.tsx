import type { PosConfig } from '@shared/ipc-contracts';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useState, type FormEvent, type ReactElement } from 'react';

import { Button, Field, Input } from '@stokk/ui';


import { ScreenShell } from '../components/screen-shell';
import { bridge, errorMessage, unwrap } from '../lib/bridge';

interface ServerSetupScreenProps {
  initialUrl: string | null;
  onSaved: (config: PosConfig) => void;
}

type TestState =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok'; service: string | null }
  | { kind: 'fail'; message: string };

/**
 * İlk açılış: sunucu adresi.
 *
 * Adres önce DENENIR, sonra kaydedilir. Yanlış adres kaydedilirse uygulama her
 * açılışta ona takılır ve kasiyerin çıkış yolu kalmaz.
 */
export function ServerSetupScreen({ initialUrl, onSaved }: ServerSetupScreenProps): ReactElement {
  const [url, setUrl] = useState(initialUrl ?? '');
  const [test, setTest] = useState<TestState>({ kind: 'idle' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleTest(): Promise<void> {
    setTest({ kind: 'testing' });
    setError(null);
    try {
      const result = await unwrap(bridge().system.testServer(url));
      setTest(
        result.reachable
          ? { kind: 'ok', service: result.service }
          : { kind: 'fail', message: 'Adrese ulaşılamadı. Bağlantıyı ve adresi kontrol edin.' },
      );
    } catch (cause) {
      setTest({ kind: 'fail', message: errorMessage(cause) });
    }
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      onSaved(await unwrap(bridge().system.setServerUrl(url)));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenShell
      title="Sunucu adresi"
      description="Kasanın bağlanacağı Stokk sunucusunun adresini girin."
      step={{ current: 1, total: 4 }}
    >
      <form className="flex flex-col gap-4" onSubmit={(event) => void handleSubmit(event)}>
        <Field
          label="Sunucu adresi"
          required
          error={error ?? undefined}
          hint="Örnek: https://api.stokk.com.tr"
        >
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              value={url}
              autoFocus
              spellCheck={false}
              placeholder="https://api.stokk.com.tr"
              onChange={(event) => {
                setUrl(event.target.value);
                setTest({ kind: 'idle' });
              }}
            />
          )}
        </Field>

        {test.kind === 'ok' ? (
          <p className="text-success flex items-center gap-2 text-sm" role="status">
            <CheckCircle2 className="size-4" aria-hidden />
            Sunucuya ulaşıldı{test.service ? ` (${test.service})` : ''}.
          </p>
        ) : null}
        {test.kind === 'fail' ? (
          <p className="text-danger flex items-center gap-2 text-sm" role="alert">
            <XCircle className="size-4" aria-hidden />
            {test.message}
          </p>
        ) : null}

        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            loading={test.kind === 'testing'}
            disabled={url.trim().length === 0}
            onClick={() => void handleTest()}
          >
            Bağlantıyı test et
          </Button>
          <Button
            type="submit"
            className="flex-1"
            loading={saving}
            disabled={url.trim().length === 0}
          >
            Kaydet ve devam et
          </Button>
        </div>
      </form>
    </ScreenShell>
  );
}
