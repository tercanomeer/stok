import type { ReactElement } from 'react';

import { cn } from '@stokk/ui';

/**
 * Stokk marka işareti — kasa çekmecesi/defter göz kırpması: yeşil zeminde,
 * içine "S" oyulmuş yuvarlatılmış kare. Skeuomorfik değil, tek ve sade.
 */
export function BrandMark({ className }: { className?: string }): ReactElement {
  return (
    <span
      className={cn(
        'bg-brand text-brand-ink inline-flex size-8 items-center justify-center rounded-[0.55rem] font-semibold',
        className,
      )}
      aria-hidden
    >
      S
    </span>
  );
}

export function BrandWordmark({ className }: { className?: string }): ReactElement {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <BrandMark />
      <span className="text-ink text-lg font-semibold tracking-tight">Stokk</span>
    </span>
  );
}
