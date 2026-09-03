import { ChevronDown } from 'lucide-react';
import type { ReactElement, Ref, SelectHTMLAttributes } from 'react';

import { cn } from '../lib/cn.js';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  ref?: Ref<HTMLSelectElement>;
}

/**
 * Yerel `<select>` — tam klavye erişilebilir, ekstra ARIA gerekmez (kasa ortamı).
 * Ok ikonu görsel, `pointer-events-none` ile tıklamayı select'e bırakır.
 */
export function Select({
  className,
  invalid = false,
  children,
  ref,
  ...props
}: SelectProps): ReactElement {
  return (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          'rounded-control bg-surface-raised text-ink h-10 w-full appearance-none border pr-9 pl-3 text-sm',
          'focus-visible:outline-2 focus-visible:outline-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-60',
          invalid ? 'border-danger focus-visible:outline-danger' : 'border-border-strong',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="text-ink-muted pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2"
        aria-hidden
      />
    </div>
  );
}
