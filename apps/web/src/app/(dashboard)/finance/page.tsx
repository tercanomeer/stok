'use client';

import { Suspense, type ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';

import { PageFallback } from '../../../components/common/page-fallback';
import { PermissionGate } from '../../../components/common/permission-gate';
import { ExpenseList } from '../../../components/finance/expense-list';

export default function FinancePage(): ReactElement {
  return (
    <PermissionGate permission={PERMISSIONS.EXPENSE_VIEW}>
      <Suspense fallback={<PageFallback />}>
        <ExpenseList />
      </Suspense>
    </PermissionGate>
  );
}
