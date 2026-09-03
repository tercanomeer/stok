'use client';

import type { ReactElement } from 'react';

import { ReportsView } from '../../../components/reports/reports-view';

/**
 * Rapor merkezi. Yetki kapısı ekranın İÇİNDE: kullanıcı bazı raporları görüp
 * bazılarını göremeyebilir (ör. kâr yalnız REPORT_PROFIT_VIEW ile).
 */
export default function ReportsPage(): ReactElement {
  return <ReportsView />;
}
