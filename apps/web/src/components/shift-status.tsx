'use client';

import type { ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';
import { cn } from '@stokk/ui';

import { useDashboardSummary } from '../hooks/use-dashboard';
import { usePermission } from '../lib/permissions';

/**
 * Topbar vardiya göstergesi — açık vardiya sayısını panel özetinden türetir
 * (aynı query anahtarı; ek istek yok). Rapor izni olmayan rolde gizlenir;
 * kişiye özel "açık vardiyam" ucu POS/vardiya ekranlarıyla (sonraki faz) gelir.
 */
export function ShiftStatus(): ReactElement | null {
  const canReports = usePermission(PERMISSIONS.REPORT_SALES_VIEW);
  const { data } = useDashboardSummary(canReports);

  if (!canReports || !data) return null;

  const open = data.openSessions > 0;
  return (
    <span className="border-border bg-surface-raised hidden items-center gap-2 rounded-full border px-3 py-1 text-sm md:inline-flex">
      <span
        className={cn('size-2 rounded-full', open ? 'bg-success' : 'bg-ink-subtle')}
        aria-hidden
      />
      <span className="text-ink-muted">
        {open ? `${data.openSessions} açık vardiya` : 'Vardiya kapalı'}
      </span>
    </span>
  );
}
