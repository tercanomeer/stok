'use client';

import { Suspense, type ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';

import { PageFallback } from '../../../components/common/page-fallback';
import { PermissionGate } from '../../../components/common/permission-gate';
import { SaleList } from '../../../components/sales/sale-list';

export default function SalesPage(): ReactElement {
  return (
    <PermissionGate permission={PERMISSIONS.SALE_VIEW}>
      <Suspense fallback={<PageFallback />}>
        <SaleList />
      </Suspense>
    </PermissionGate>
  );
}
