import type { ReactElement, Ref, TextareaHTMLAttributes } from 'react';

import { cn } from '../lib/cn.js';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({
  className,
  invalid = false,
  rows = 3,
  ref,
  ...props
}: TextareaProps): ReactElement {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(
        'rounded-control bg-surface-raised text-ink w-full border px-3 py-2 text-sm',
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
