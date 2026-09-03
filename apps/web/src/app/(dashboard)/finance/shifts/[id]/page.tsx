'use client';

import { useParams } from 'next/navigation';
import type { ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';

import { PermissionGate } from '../../../../../components/common/permission-gate';
import { ShiftDetail } from '../../../../../components/finance/shift-detail';

export default function ShiftDetailPage(): ReactElement {
  const params = useParams<{ id: string }>();
  return (
    <PermissionGate permission={PERMISSIONS.CASH_SESSION_OPEN}>
      <ShiftDetail sessionId={params.id} />
    </PermissionGate>
  );
}
