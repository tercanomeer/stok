import type { LabelHTMLAttributes, ReactElement } from 'react';

import { cn } from '../lib/cn.js';

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  /** Zorunlu alan işareti. */
  required?: boolean;
}

export function Label({ className, required, children, ...props }: LabelProps): ReactElement {
  return (
    <label className={cn('text-ink text-sm font-medium', className)} {...props}>
      {children}
      {required ? (
        <span className="text-danger ml-0.5" aria-hidden>
          *
        </span>
      ) : null}
    </label>
  );
}
