'use client';

import type { ReactElement } from 'react';

import { SectionTabs } from '../common/section-tabs';

const STOCK_TABS = [
  { label: 'Stok durumu', href: '/stock' },
  { label: 'Hareketler', href: '/stock/movements' },
  { label: 'Sayımlar', href: '/stock/counts' },
] as const;

export function StockTabs(): ReactElement {
  return <SectionTabs tabs={STOCK_TABS} />;
}
