import type { LucideIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { Card, cn, Spinner } from '@stokk/ui';

export interface StatTileProps {
  label: string;
  value: string;
  hint?: string | undefined;
  icon: LucideIcon;
  /** İkon vurgusu; kritik/uyarı tonları anlam taşır. */
  tone?: 'brand' | 'warning' | 'danger' | 'neutral';
  loading?: boolean;
}

const TONE_CLASS = {
  brand: 'bg-brand-weak text-brand-weak-ink',
  warning: 'bg-warning-weak text-warning',
  danger: 'bg-danger-weak text-danger',
  neutral: 'bg-surface-sunken text-ink-muted',
} as const;

/** Panel istatistik kartı — büyük tabular sayı, tek satır etiket. */
export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
  loading = false,
}: StatTileProps): ReactElement {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-ink-muted text-sm">{label}</p>
          {loading ? (
            <Spinner />
          ) : (
            <p className="tabular text-ink truncate text-2xl font-semibold">{value}</p>
          )}
          {hint && !loading ? <p className="text-ink-subtle text-xs">{hint}</p> : null}
        </div>
        <span
          className={cn(
            'rounded-control flex size-9 shrink-0 items-center justify-center',
            TONE_CLASS[tone],
          )}
        >
          <Icon className="size-5" aria-hidden />
        </span>
      </div>
    </Card>
  );
}
