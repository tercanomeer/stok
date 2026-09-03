'use client';

import type { ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';

import { PermissionGate } from '../../../../components/common/permission-gate';
import { ExpenseCategories } from '../../../../components/finance/expense-categories';

export default function ExpenseCategoriesPage(): ReactElement {
  return (
    <PermissionGate permission={PERMISSIONS.EXPENSE_VIEW}>
      <ExpenseCategories />
    </PermissionGate>
  );
}
