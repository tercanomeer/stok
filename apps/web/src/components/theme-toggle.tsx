'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState, type ReactElement } from 'react';

import { Button } from '@stokk/ui';

const ORDER = ['light', 'dark', 'system'] as const;
const ICON = { light: Sun, dark: Moon, system: Monitor } as const;
const LABEL = { light: 'Açık tema', dark: 'Koyu tema', system: 'Sistem teması' } as const;

/** Tema döngüsü: açık → koyu → sistem. Hidrasyon öncesi ikon sabit (mismatch önlenir). */
export function ThemeToggle(): ReactElement {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // next-themes: gerçek tema yalnız client'ta bilinir; mount sonrası ikonu
    // güncelle, sunucu/istemci ilk render'ı aynı kalsın (hydration mismatch yok).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kasıtlı mount kapısı
    setMounted(true);
  }, []);

  const current = mounted ? ((theme ?? 'system') as (typeof ORDER)[number]) : 'system';
  const Icon = ICON[current];

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`${LABEL[current]} — değiştir`}
      title={LABEL[current]}
      onClick={() => {
        const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
        setTheme(next ?? 'system');
      }}
    >
      <Icon className="size-5" aria-hidden />
    </Button>
  );
}
