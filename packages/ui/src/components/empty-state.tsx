import type { LucideIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { cn } from '../lib/cn.js';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Eylem: boş ekran davettir, yapılacak bir şey sun. */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps): ReactElement {
  return (
    <div
      className={cn(
        'rounded-card border-border-strong flex flex-col items-center justify-center gap-3 border border-dashed px-6 py-12 text-center',
        className,
      )}
    >
      {Icon ? <Icon className="text-ink-subtle size-8" aria-hidden /> : null}
      <div className="flex flex-col gap-1">
        <p className="text-ink font-medium">{title}</p>
        {description ? (
          <p className="text-ink-muted mx-auto max-w-sm text-sm">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
