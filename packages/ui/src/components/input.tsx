import type { InputHTMLAttributes, ReactElement, Ref } from 'react';

import { cn } from '../lib/cn.js';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Hatalı alan: kenarlık ve odak halkası danger'a döner. */
  invalid?: boolean;
  ref?: Ref<HTMLInputElement> | undefined;
}

export function Input({ className, invalid = false, ref, ...props }: InputProps): ReactElement {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'rounded-control bg-surface-raised text-ink h-10 w-full border px-3 text-sm',
        'placeholder:text-ink-subtle',
        'focus-visible:outline-2 focus-visible:outline-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-60',
        invalid ? 'border-danger focus-visible:outline-danger' : 'border-border-strong',
        className,
      )}
      {...props}
    />
  );
}
