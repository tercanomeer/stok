'use client';

import type { ReactElement } from 'react';

import { SectionTabs } from '../common/section-tabs';

const ADMIN_TABS = [
  { label: 'Kullanıcılar', href: '/users' },
  { label: 'Roller ve izinler', href: '/users/roles' },
] as const;

export function AdminTabs(): ReactElement {
  return <SectionTabs tabs={ADMIN_TABS} />;
}
