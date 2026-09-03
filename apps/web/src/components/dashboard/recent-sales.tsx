import { Receipt } from 'lucide-react';
import type { ReactElement } from 'react';

import {
  Badge,
  EmptyState,
  formatMoney,
  formatTime,
  TBody,
  TD,
  TH,
  THead,
  Table,
  TR,
} from '@stokk/ui';

import type { SaleListItem, SaleStatus } from '../../lib/api-types';

const STATUS: Record<
  SaleStatus,
  { label: string; tone: 'neutral' | 'warning' | 'danger' | 'success' }
> = {
  COMPLETED: { label: 'Tamamlandı', tone: 'success' },
  PARKED: { label: 'Beklemede', tone: 'neutral' },
  CANCELLED: { label: 'İptal', tone: 'danger' },
  PARTIALLY_RETURNED: { label: 'Kısmi iade', tone: 'warning' },
  RETURNED: { label: 'İade', tone: 'warning' },
};

/** Son satışlar listesi — fiş no, cari, saat, tutar, durum. */
export function RecentSales({ items }: { items: SaleListItem[] }): ReactElement {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="Bugün henüz satış yok"
        description="İlk satış kasadan girildiğinde burada görünür."
      />
    );
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH>Fiş</TH>
          <TH>Cari</TH>
          <TH>Saat</TH>
          <TH numeric>Tutar</TH>
          <TH>Durum</TH>
        </TR>
      </THead>
      <TBody>
        {items.map((s) => {
          const st = STATUS[s.status];
          return (
            <TR key={s.id}>
              <TD className="tabular font-medium">{s.receiptNo}</TD>
              <TD className="text-ink-muted">{s.contact?.name ?? 'Perakende'}</TD>
              <TD className="tabular text-ink-muted">{formatTime(s.soldAt)}</TD>
              <TD numeric className="font-medium">
                {formatMoney(s.grandTotal)}
              </TD>
              <TD>
                <Badge tone={st.tone}>{st.label}</Badge>
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}
