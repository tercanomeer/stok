'use client';

import type { ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';

import { PermissionGate } from '../../../../components/common/permission-gate';
import { CountList } from '../../../../components/stock/count-list';

export default function CountsPage(): ReactElement {
  return (
    <PermissionGate permission={PERMISSIONS.STOCK_COUNT}>
      <CountList />
    </PermissionGate>
  );
}
