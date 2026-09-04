import type { PosConfig, Register } from '@shared/ipc-contracts';
import { Monitor } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';

import { Button, EmptyState, Spinner } from '@stokk/ui';


import { ScreenShell } from '../components/screen-shell';
import { bridge, errorMessage, unwrap } from '../lib/bridge';

interface RegisterSelectScreenProps {
  selectedId: string | null;
  onSelected: (config: PosConfig) => void;
  onLogout: () => void;
}

/**
 * Kasa seçimi. Seçim MAKİNEYE yazılır: aynı kasa PC'si her açılışta aynı kasadır,
 * kasiyer değişse bile yeniden sorulmaz.
 */
export function RegisterSelectScreen({
  selectedId,
  onSelected,
  onLogout,
}: RegisterSelectScreenProps): ReactElement {
  const [registers, setRegisters] = useState<Register[] | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    unwrap(bridge().shift.registers())
      .then((items) => {
        if (active) setRegisters(items.filter((register) => register.isActive));
      })
      .catch((cause: unknown) => {
        if (active) setError(errorMessage(cause, 'Kasa listesi alınamadı.'));
      });
    return () => {
      active = false;
    };
  }, []);

  // Seçim main process'e YAZILIR: kasa makinenin ayarıdır, ekranın state'i değil.
  // Yazılmazsa vardiya sorgusu ve açılışı yanlış kasaya bakar.
  async function select(register: Register): Promise<void> {
    setSaving(register.id);
    setError(null);
    try {
      onSelected(
        await unwrap(
          bridge().shift.selectRegister({ registerId: register.id, registerName: register.name }),
        ),
      );
    } catch (cause) {
      setError(errorMessage(cause, 'Kasa seçimi kaydedilemedi.'));
    } finally {
      setSaving(null);
    }
  }

  return (
    <ScreenShell
      title="Kasa seçimi"
      description="Bu bilgisayarın hangi kasa olduğunu seçin."
      step={{ current: 3, total: 4 }}
      footer={
        <Button variant="link" size="sm" className="px-0" onClick={onLogout}>
          Çıkış yap
        </Button>
      }
    >
      {error ? (
        <p className="text-danger text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {registers === null && !error ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : null}

      {registers !== null && registers.length === 0 ? (
        <EmptyState
          icon={Monitor}
          title="Tanımlı kasa yok"
          description="Yönetim panelinden en az bir kasa tanımlayın."
        />
      ) : null}

      <div className="flex flex-col gap-2">
        {(registers ?? []).map((register) => (
          <Button
            key={register.id}
            variant={register.id === selectedId ? 'primary' : 'secondary'}
            size="lg"
            className="justify-start"
            loading={saving === register.id}
            disabled={saving !== null}
            onClick={() => void select(register)}
          >
            <Monitor aria-hidden />
            {register.name}
          </Button>
        ))}
      </div>
    </ScreenShell>
  );
}
