'use client';

import type { ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';

import { PermissionGate } from '../../../../components/common/permission-gate';
import { ShiftList } from '../../../../components/finance/shift-list';

export default function ShiftsPage(): ReactElement {
  return (
    <PermissionGate permission={PERMISSIONS.CASH_SESSION_VIEW_ALL}>
      <ShiftList />
    </PermissionGate>
  );
}
