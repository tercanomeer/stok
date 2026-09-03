'use client';

import type { ReactElement, ReactNode } from 'react';

import type { Permission } from '@stokk/types';

import { usePermission } from '../lib/permissions';

export interface CanProps {
  permission: Permission;
  children: ReactNode;
  /** İzin yoksa gösterilecek (varsayılan: hiçbir şey). */
  fallback?: ReactNode;
}

/** İzin bazlı görünürlük kapısı. Yetki yoksa çocukları render ETMEZ. */
export function Can({ permission, children, fallback = null }: CanProps): ReactElement {
  const allowed = usePermission(permission);
  return <>{allowed ? children : fallback}</>;
}
