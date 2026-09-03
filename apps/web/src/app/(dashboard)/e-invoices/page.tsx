'use client';

import { Suspense, type ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';

import { EInvoiceList } from '../../../components/admin/einvoice-list';
import { PageFallback } from '../../../components/common/page-fallback';
import { PermissionGate } from '../../../components/common/permission-gate';

export default function EInvoicesPage(): ReactElement {
  return (
    <PermissionGate permission={PERMISSIONS.EINVOICE_VIEW}>
      <Suspense fallback={<PageFallback />}>
        <EInvoiceList />
      </Suspense>
    </PermissionGate>
  );
}
