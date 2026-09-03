'use client';

import { Suspense, type ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';

import { PageFallback } from '../../../../components/common/page-fallback';
import { PermissionGate } from '../../../../components/common/permission-gate';
import { MovementList } from '../../../../components/stock/movement-list';

export default function MovementsPage(): ReactElement {
  return (
    <PermissionGate permission={PERMISSIONS.STOCK_VIEW}>
      <Suspense fallback={<PageFallback />}>
        <MovementList />
      </Suspense>
    </PermissionGate>
  );
}
