'use client';

import { Suspense, type ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';

import { PageFallback } from '../../../components/common/page-fallback';
import { PermissionGate } from '../../../components/common/permission-gate';
import { PurchaseList } from '../../../components/purchases/purchase-list';

export default function PurchasesPage(): ReactElement {
  return (
    <PermissionGate permission={PERMISSIONS.PURCHASE_VIEW}>
      <Suspense fallback={<PageFallback />}>
        <PurchaseList />
      </Suspense>
    </PermissionGate>
  );
}
