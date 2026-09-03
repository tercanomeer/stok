'use client';

import { Suspense, type ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';

import { AuditLogView } from '../../../../components/admin/audit-log';
import { PageFallback } from '../../../../components/common/page-fallback';
import { PermissionGate } from '../../../../components/common/permission-gate';

export default function AuditLogPage(): ReactElement {
  return (
    <PermissionGate permission={PERMISSIONS.AUDIT_LOG_VIEW}>
      <Suspense fallback={<PageFallback />}>
        <AuditLogView />
      </Suspense>
    </PermissionGate>
  );
}
