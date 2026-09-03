import Link from 'next/link';

import { buttonVariants } from '@stokk/ui';

export default function NotFound(): React.JSX.Element {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="tabular text-ink text-4xl font-semibold">404</p>
      <div className="space-y-1">
        <h1 className="text-ink text-lg font-semibold">Sayfa bulunamadı</h1>
        <p className="text-ink-muted max-w-sm text-sm">
          Aradığınız sayfa taşınmış ya da hiç var olmamış olabilir.
        </p>
      </div>
      <Link href="/" className={buttonVariants()}>
        Panele dön
      </Link>
    </div>
  );
}
