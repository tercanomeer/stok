'use client';

import type { ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';

import { RoleMatrix } from '../../../../components/admin/role-matrix';
import { PermissionGate } from '../../../../components/common/permission-gate';

export default function RolesPage(): ReactElement {
  return (
    <PermissionGate permission={PERMISSIONS.ROLE_MANAGE}>
      <RoleMatrix />
    </PermissionGate>
  );
}
