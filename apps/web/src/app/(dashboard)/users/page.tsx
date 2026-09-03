'use client';

import type { ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';

import { UserList } from '../../../components/admin/user-list';
import { PermissionGate } from '../../../components/common/permission-gate';

export default function UsersPage(): ReactElement {
  return (
    <PermissionGate permission={PERMISSIONS.USER_VIEW}>
      <UserList />
    </PermissionGate>
  );
}
