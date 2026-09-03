'use client';

import type { ReactElement } from 'react';

import { SectionTabs } from '../common/section-tabs';

const SETTINGS_TABS = [
  { label: 'İşletme', href: '/settings' },
  { label: 'Denetim kaydı', href: '/settings/audit' },
] as const;

export function SettingsTabs(): ReactElement {
  return <SectionTabs tabs={SETTINGS_TABS} />;
}
