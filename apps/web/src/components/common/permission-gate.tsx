'use client';

import { ShieldAlert } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import type { Permission } from '@stokk/types';
import { EmptyState } from '@stokk/ui';

import { usePermission } from '../../lib/permissions';

export interface PermissionGateProps {
  permission: Permission;
  children: ReactNode;
}

/**
 * Ekran düzeyinde yetki kapısı. Menüde gizlemek tek başına güvenlik değildir:
 * doğrudan URL ile gelen yetkisiz kullanıcı burada durur. Asıl koruma sunucudaki
 * `@Permissions()`; bu katman kullanıcıya boş/hatalı ekran yerine açıklama gösterir.
 */
export function PermissionGate({ permission, children }: PermissionGateProps): ReactElement {
  const allowed = usePermission(permission);

  if (!allowed) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Bu ekran için yetkiniz yok"
        description="Erişim gerekiyorsa yöneticinizden bu işlem için yetki isteyin."
      />
    );
  }

  return <>{children}</>;
}
