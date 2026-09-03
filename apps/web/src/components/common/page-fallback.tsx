import type { ReactElement } from 'react';

import { Spinner } from '@stokk/ui';

/** `useSearchParams` kullanan ekranların Suspense sınırı için ortak bekleme durumu. */
export function PageFallback(): ReactElement {
  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner label="Yükleniyor" />
    </div>
  );
}
