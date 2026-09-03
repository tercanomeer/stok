'use client';

import { Suspense, type ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';

import { PageFallback } from '../../../components/common/page-fallback';
import { PermissionGate } from '../../../components/common/permission-gate';
import { StockList } from '../../../components/stock/stock-list';

export default function StockPage(): ReactElement {
  return (
    <PermissionGate permission={PERMISSIONS.STOCK_VIEW}>
      <Suspense fallback={<PageFallback />}>
        <StockList />
      </Suspense>
    </PermissionGate>
  );
}
