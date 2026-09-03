import type { Permission } from '@stokk/types';

import { useAuthStore } from '../stores/auth-store';

/** Kullanıcının izin listesinde verilen kod var mı (saf yardımcı). */
export function hasPermission(userPermissions: string[], permission: Permission): boolean {
  return userPermissions.includes(permission);
}

/** React hook: mevcut oturum verilen izne sahip mi. */
export function usePermission(permission: Permission): boolean {
  const permissions = useAuthStore((s) => s.user?.permissions);
  return permissions ? hasPermission(permissions, permission) : false;
}
