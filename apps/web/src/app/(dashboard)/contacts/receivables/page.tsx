'use client';

import type { ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';

import { PermissionGate } from '../../../../components/common/permission-gate';
import { Receivables } from '../../../../components/contacts/receivables';

export default function ReceivablesPage(): ReactElement {
  return (
    <PermissionGate permission={PERMISSIONS.CONTACT_VIEW}>
      <Receivables />
    </PermissionGate>
  );
}
