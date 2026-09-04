import type { ReactElement } from 'react';

import { Spinner } from '@stokk/ui';

export function SplashScreen({ message }: { message?: string }): ReactElement {
  return (
    <div className="bg-surface-sunken flex min-h-screen flex-col items-center justify-center gap-4">
      <p className="text-ink text-2xl font-semibold tracking-tight">Stokk POS</p>
      <Spinner />
      <p className="text-ink-muted text-sm" role="status">
        {message ?? 'Başlatılıyor…'}
      </p>
    </div>
  );
}
