'use client';

import { TriangleAlert } from 'lucide-react';
import { useEffect } from 'react';

import { Button } from '@stokk/ui';

/** Kök hata sınırı — beklenmeyen hatayı yakalar, tekrar dene sunar. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <TriangleAlert className="text-danger size-10" aria-hidden />
      <div className="space-y-1">
        <h1 className="text-ink text-lg font-semibold">Bir şeyler ters gitti</h1>
        <p className="text-ink-muted max-w-sm text-sm">
          İşlem tamamlanamadı. Tekrar deneyin; sorun sürerse sayfayı yenileyin.
        </p>
      </div>
      <Button onClick={reset}>Tekrar dene</Button>
    </div>
  );
}
