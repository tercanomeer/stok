'use client';

import { type ReactElement } from 'react';

import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  formatDateTime,
  formatMoney,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@stokk/ui';

import { FinanceTabs } from './finance-tabs';
import { useCashSession } from '../../hooks/use-cash-sessions';
import { apiErrorMessage } from '../../lib/api';
import { CASH_MOVEMENT_LABELS } from '../../lib/finance-labels';
import { PageHeader } from '../common/page-header';
import { FormBanner } from '../form-banner';

/**
 * Vardiya detayı ve fark raporu.
 *
 * Beklenen kasa = hareketlerin toplamı (açılış dahil, tutarlar işaretli).
 * Fark = sayılan − beklenen: eksi kasada eksik, artı fazla demektir. Fark ve beklenen
 * tutar SUNUCUDA hesaplanır; ekran yalnız gösterir.
 */
export function ShiftDetail({ sessionId }: { sessionId: string }): ReactElement {
  const session = useCashSession(sessionId);

  if (session.isPending) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner label="Vardiya yükleniyor" />
      </div>
    );
  }
  if (session.isError) return <FormBanner message={apiErrorMessage(session.error)} />;

  const data = session.data;
  const difference =
    data.differenceAmount === null ? null : Number.parseFloat(data.differenceAmount);
  const hasDifference = difference !== null && Number.isFinite(difference) && difference !== 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Vardiya · ${formatDateTime(data.openedAt)}`}
        description={
          data.status === 'OPEN'
            ? 'Vardiya açık — kapanış sayımı henüz yapılmadı.'
            : `Kapanış: ${data.closedAt ? formatDateTime(data.closedAt) : '—'}`
        }
        actions={
          <Badge tone={data.status === 'OPEN' ? 'brand' : 'neutral'}>
            {data.status === 'OPEN' ? 'Açık' : 'Kapalı'}
          </Badge>
        }
      />
      <FinanceTabs />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AmountTile label="Açılış nakiti" value={data.openingAmount} />
        <AmountTile label="Beklenen" value={data.expectedAmount} />
        <AmountTile label="Sayılan" value={data.closingAmount} />
        <AmountTile
          label="Fark"
          value={data.differenceAmount}
          tone={hasDifference ? 'danger' : 'success'}
        />
      </div>

      {hasDifference ? (
        <div
          role="status"
          className="rounded-card border-danger/30 bg-danger-weak text-danger border px-4 py-3 text-sm"
        >
          Kasa sayımı beklenenden {formatMoney(data.differenceAmount ?? '0')} farklı.
          {difference < 0 ? ' Kasada eksik var.' : ' Kasada fazla var.'}
        </div>
      ) : null}

      {data.note ? (
        <p className="text-ink-muted text-sm">
          <span className="text-ink font-medium">Not: </span>
          {data.note}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Kasa hareketleri</CardTitle>
        </CardHeader>
        <CardBody>
          {data.movements.length === 0 ? (
            <p className="text-ink-muted text-sm">Bu vardiyada kasa hareketi yok.</p>
          ) : (
            <div className="border-border rounded-control overflow-hidden border">
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>Saat</TH>
                    <TH>Tip</TH>
                    <TH>Açıklama</TH>
                    <TH numeric>Tutar</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.movements.map((movement) => {
                    const amount = Number.parseFloat(movement.amount);
                    return (
                      <TR key={movement.id}>
                        <TD className="tabular text-ink-muted">
                          {formatDateTime(movement.createdAt)}
                        </TD>
                        <TD>{CASH_MOVEMENT_LABELS[movement.type]}</TD>
                        <TD>{movement.description ?? '—'}</TD>
                        <TD numeric>
                          <span
                            className={
                              amount < 0 ? 'text-danger font-medium' : 'text-success font-medium'
                            }
                          >
                            {formatMoney(movement.amount)}
                          </span>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function AmountTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | null;
  tone?: 'danger' | 'success';
}): ReactElement {
  return (
    <Card className="p-4">
      <p className="text-ink-muted text-sm">{label}</p>
      <p
        className={
          value === null
            ? 'text-ink-subtle tabular text-xl font-semibold'
            : tone === 'danger'
              ? 'text-danger tabular text-xl font-semibold'
              : tone === 'success'
                ? 'text-success tabular text-xl font-semibold'
                : 'text-ink tabular text-xl font-semibold'
        }
      >
        {value === null ? '—' : formatMoney(value)}
      </p>
    </Card>
  );
}
