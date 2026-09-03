'use client';

import type { ReactElement } from 'react';

import { SectionTabs } from '../common/section-tabs';

const FINANCE_TABS = [
  { label: 'Giderler', href: '/finance' },
  { label: 'Gelirler', href: '/finance/incomes' },
  { label: 'Gider kategorileri', href: '/finance/categories' },
  { label: 'Vardiyalar', href: '/finance/shifts' },
] as const;

export function FinanceTabs(): ReactElement {
  return <SectionTabs tabs={FINANCE_TABS} />;
}
