'use client';

import { Download, HandCoins, Printer } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  formatDate,
  formatDateTime,
  formatMoney,
  formatPercent,
  Input,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useToast,
} from '@stokk/ui';

import { PaymentDialog } from './payment-dialog';
import { downloadStatement, useAging, useContact, useStatement } from '../../hooks/use-contacts';
import { apiErrorMessage } from '../../lib/api';
import { balanceView, creditUsageRatio, isOverCreditLimit } from '../../lib/contact-balance';
import {
  CONTACT_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  TRANSACTION_TYPE_LABELS,
} from '../../lib/finance-labels';
import { usePermission } from '../../lib/permissions';
import { PageHeader } from '../common/page-header';
import { FormBanner } from '../form-banner';

/** Varsayılan ekstre aralığı: son 90 gün (veresiye takibinin doğal penceresi). */
function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 90);
  return { from: toDateInput(from), to: toDateInput(to) };
}

function toDateInput(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

/** Yerel gün sınırlarını UTC ISO'ya çevirir (CLAUDE.md: UTC sakla, yerel göster). */
function toIsoRange(range: { from: string; to: string }): { from: string; to: string } {
  return {
    from: new Date(`${range.from}T00:00:00`).toISOString(),
    to: new Date(`${range.to}T23:59:59.999`).toISOString(),
  };
}

export function ContactDetail({ contactId }: { contactId: string }): ReactElement {
  const [range, setRange] = useState(defaultRange);
  const contact = useContact(contactId);
  const statement = useStatement(contactId, toIsoRange(range));
  const aging = useAging(contactId);
  const toast = useToast();
  const canPay = usePermission(PERMISSIONS.CONTACT_TRANSACTION_MANAGE);
  const [paying, setPaying] = useState(false);
  const [downloading, setDownloading] = useState(false);

  if (contact.isPending) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner label="Cari yükleniyor" />
      </div>
    );
  }
  if (contact.isError) return <FormBanner message={apiErrorMessage(contact.error)} />;

  const view = balanceView(contact.data.balance);
  const usage = creditUsageRatio(contact.data);

  async function handleDownload(): Promise<void> {
    if (!contact.data) return;
    setDownloading(true);
    try {
      await downloadStatement(contactId, contact.data.name, toIsoRange(range));
    } catch (error) {
      toast.error('Ekstre indirilemedi', apiErrorMessage(error));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="no-print">
        <PageHeader
          title={contact.data.name}
          description={`${CONTACT_TYPE_LABELS[contact.data.type]}${contact.data.phone ? ` · ${contact.data.phone}` : ''}`}
          actions={
            <>
              <Button
                variant="outline"
                loading={downloading}
                onClick={() => {
                  void handleDownload();
                }}
              >
                <Download aria-hidden />
                Excel
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  window.print();
                }}
              >
                <Printer aria-hidden />
                Yazdır / PDF
              </Button>
              {canPay ? (
                <Button
                  onClick={() => {
                    setPaying(true);
                  }}
                >
                  <HandCoins aria-hidden />
                  Tahsilat / Ödeme
                </Button>
              ) : null}
            </>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Bakiye</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2">
            <p
              className={
                view.direction === 'receivable'
                  ? 'text-danger tabular text-2xl font-semibold'
                  : view.direction === 'payable'
                    ? 'text-warning tabular text-2xl font-semibold'
                    : 'text-ink tabular text-2xl font-semibold'
              }
            >
              {view.direction === 'settled' ? formatMoney('0') : formatMoney(view.amount)}
            </p>
            <Badge tone={view.tone}>{view.label}</Badge>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Veresiye limiti</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2">
            {usage === null ? (
              <p className="text-ink-muted text-sm">Limit tanımlı değil.</p>
            ) : (
              <>
                <p className="text-ink tabular text-2xl font-semibold">
                  {formatMoney(contact.data.creditLimit)}
                </p>
                <p className="text-ink-muted text-sm">Kullanım: {formatPercent(usage * 100, 0)}</p>
                {isOverCreditLimit(contact.data) ? <Badge tone="danger">Limit aşıldı</Badge> : null}
              </>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Borç yaşlandırma</CardTitle>
          </CardHeader>
          <CardBody>
            {aging.isPending ? (
              <Spinner label="Hesaplanıyor" />
            ) : aging.isError ? (
              <p className="text-danger text-sm">{apiErrorMessage(aging.error)}</p>
            ) : (
              <dl className="space-y-1 text-sm">
                <AgingRow label="0–30 gün" value={aging.data.current} />
                <AgingRow label="31–60 gün" value={aging.data.days31to60} />
                <AgingRow label="61–90 gün" value={aging.data.days61to90} />
                <AgingRow label="90+ gün" value={aging.data.over90} tone="danger" />
                <div className="border-border mt-2 flex justify-between border-t pt-2 font-medium">
                  <dt>Toplam</dt>
                  <dd className="tabular">{formatMoney(aging.data.total)}</dd>
                </div>
              </dl>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-end justify-between gap-3">
          <CardTitle>Ekstre</CardTitle>
          <div className="no-print flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-ink font-medium">Başlangıç</span>
              <Input
                type="date"
                className="h-9 w-40"
                value={range.from}
                onChange={(e) => {
                  setRange((prev) => ({ ...prev, from: e.target.value }));
                }}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-ink font-medium">Bitiş</span>
              <Input
                type="date"
                className="h-9 w-40"
                value={range.to}
                onChange={(e) => {
                  setRange((prev) => ({ ...prev, to: e.target.value }));
                }}
              />
            </label>
          </div>
        </CardHeader>
        <CardBody>
          {statement.isPending ? (
            <div className="flex h-40 items-center justify-center">
              <Spinner label="Ekstre yükleniyor" />
            </div>
          ) : statement.isError ? (
            <FormBanner message={apiErrorMessage(statement.error)} />
          ) : (
            <div className="space-y-3">
              <p className="text-ink-muted text-sm">
                {formatDate(range.from)} – {formatDate(range.to)} · Açılış{' '}
                <span className="text-ink tabular font-medium">
                  {formatMoney(statement.data.opening)}
                </span>{' '}
                · Kapanış{' '}
                <span className="text-ink tabular font-medium">
                  {formatMoney(statement.data.closing)}
                </span>
              </p>

              {statement.data.movements.length === 0 ? (
                <p className="text-ink-muted text-sm">Bu aralıkta hareket yok.</p>
              ) : (
                <div className="border-border rounded-control overflow-hidden border">
                  <Table>
                    <THead>
                      <TR className="hover:bg-transparent">
                        <TH>Tarih</TH>
                        <TH>Açıklama</TH>
                        <TH>Yöntem</TH>
                        <TH numeric>Borç</TH>
                        <TH numeric>Alacak</TH>
                        <TH numeric>Bakiye</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {statement.data.movements.map((movement) => (
                        <TR key={movement.id}>
                          <TD className="tabular text-ink-muted">
                            {formatDateTime(movement.createdAt)}
                          </TD>
                          <TD>{movement.description ?? TRANSACTION_TYPE_LABELS[movement.type]}</TD>
                          <TD>
                            {movement.paymentMethod
                              ? PAYMENT_METHOD_LABELS[movement.paymentMethod]
                              : '—'}
                          </TD>
                          <TD numeric>
                            {movement.type === 'DEBIT' ? formatMoney(movement.amount) : '—'}
                          </TD>
                          <TD numeric>
                            {movement.type === 'CREDIT' ? formatMoney(movement.amount) : '—'}
                          </TD>
                          <TD numeric className="font-medium">
                            {formatMoney(movement.balanceAfter)}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      <PaymentDialog
        contact={paying ? contact.data : null}
        onClose={() => {
          setPaying(false);
        }}
      />
    </div>
  );
}

function AgingRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'danger';
}): ReactElement {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={tone === 'danger' ? 'text-danger tabular' : 'tabular'}>
        {formatMoney(value)}
      </dd>
    </div>
  );
}
