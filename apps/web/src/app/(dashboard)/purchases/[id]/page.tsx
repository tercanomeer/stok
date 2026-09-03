'use client';

import { useParams } from 'next/navigation';
import type { ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';

import { PermissionGate } from '../../../../components/common/permission-gate';
import { PurchaseDetail } from '../../../../components/purchases/purchase-detail';

export default function PurchaseDetailPage(): ReactElement {
  const params = useParams<{ id: string }>();
  return (
    <PermissionGate permission={PERMISSIONS.PURCHASE_VIEW}>
      <PurchaseDetail purchaseId={params.id} />
    </PermissionGate>
  );
}
