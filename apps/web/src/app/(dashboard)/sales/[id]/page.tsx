'use client';

import { useParams } from 'next/navigation';
import type { ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';

import { PermissionGate } from '../../../../components/common/permission-gate';
import { SaleDetailView } from '../../../../components/sales/sale-detail';

export default function SaleDetailPage(): ReactElement {
  const params = useParams<{ id: string }>();
  return (
    <PermissionGate permission={PERMISSIONS.SALE_VIEW}>
      <SaleDetailView saleId={params.id} />
    </PermissionGate>
  );
}
