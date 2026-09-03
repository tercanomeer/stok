import { useId, type ReactElement, type ReactNode } from 'react';

import { Label } from './label.js';
import { cn } from '../lib/cn.js';

export interface FieldProps {
  label: string;
  /** Alanın kontrolü. `htmlFor`/`id` ve `aria-describedby` bağlaması için render-prop. */
  children: (ids: { id: string; describedBy: string | undefined }) => ReactNode;
  error?: string | undefined;
  hint?: string | undefined;
  required?: boolean;
  className?: string;
}

/**
 * Ortak form alanı: etiket + kontrol + hata/ipucu. Hata varsa ipucunun yerini alır,
 * `role="alert"` ile okuyucuya bildirilir, kontrole `aria-describedby` ile bağlanır.
 */
export function Field({
  label,
  children,
  error,
  hint,
  required = false,
  className,
}: FieldProps): ReactElement {
  const id = useId();
  const messageId = `${id}-msg`;
  const describedBy = error || hint ? messageId : undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      {children({ id, describedBy })}
      {error ? (
        <p id={messageId} role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-ink-muted text-sm">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
