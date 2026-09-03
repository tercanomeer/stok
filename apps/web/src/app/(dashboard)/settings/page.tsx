'use client';

import type { ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';

import { SettingsView } from '../../../components/admin/settings-view';
import { PermissionGate } from '../../../components/common/permission-gate';

export default function SettingsPage(): ReactElement {
  return (
    <PermissionGate permission={PERMISSIONS.SETTINGS_MANAGE}>
      <SettingsView />
    </PermissionGate>
  );
}
