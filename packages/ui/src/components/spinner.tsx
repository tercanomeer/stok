import { Loader2 } from 'lucide-react';
import type { ReactElement } from 'react';

import { cn } from '../lib/cn.js';

export interface SpinnerProps {
  className?: string;
  /** Erişilebilir etiket; yalnız spinner tek başına yükleniyor göstergesiyse ver. */
  label?: string;
}

export function Spinner({ className, label }: SpinnerProps): ReactElement {
  return (
    <span role="status" className="text-ink-muted inline-flex items-center gap-2">
      <Loader2 className={cn('size-4 animate-spin', className)} aria-hidden />
      {label ? (
        <span className="text-sm">{label}</span>
      ) : (
        <span className="sr-only">Yükleniyor</span>
      )}
    </span>
  );
}
