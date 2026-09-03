'use client';

import { useParams } from 'next/navigation';
import type { ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';

import { PermissionGate } from '../../../../../components/common/permission-gate';
import { CountDetail } from '../../../../../components/stock/count-detail';

export default function CountDetailPage(): ReactElement {
  const params = useParams<{ id: string }>();
  return (
    <PermissionGate permission={PERMISSIONS.STOCK_COUNT}>
      <CountDetail countId={params.id} />
    </PermissionGate>
  );
}
