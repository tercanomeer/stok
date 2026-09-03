'use client';

import { Suspense, type ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';

import { PageFallback } from '../../../../components/common/page-fallback';
import { PermissionGate } from '../../../../components/common/permission-gate';
import { IncomeList } from '../../../../components/finance/income-list';

export default function IncomesPage(): ReactElement {
  return (
    <PermissionGate permission={PERMISSIONS.INCOME_VIEW}>
      <Suspense fallback={<PageFallback />}>
        <IncomeList />
      </Suspense>
    </PermissionGate>
  );
}
