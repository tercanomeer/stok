'use client';

import { BookUser, PencilLine, Trash2, UserPlus, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, type ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';
import { Badge, EmptyState, formatMoney, Select, useToast } from '@stokk/ui';

import { ContactFormDialog } from './contact-form-dialog';
import { useContacts, useDeleteContact } from '../../hooks/use-contacts';
import { useListParams } from '../../hooks/use-list-params';
import { usePageClamp } from '../../hooks/use-page-clamp';
import { apiErrorMessage } from '../../lib/api';
import type { Contact } from '../../lib/api-types';
import { balanceView, isOverCreditLimit } from '../../lib/contact-balance';
import { CONTACT_TYPE_LABELS } from '../../lib/finance-labels';
import { usePermission } from '../../lib/permissions';
import { Can } from '../can';
import { ConfirmDialog } from '../common/confirm-dialog';
import { DataTable, type Column } from '../common/data-table';
import { LinkButton } from '../common/link-button';
import { PageHeader } from '../common/page-header';
import { PaginationBar } from '../common/pagination-bar';
import { SearchInput } from '../common/search-input';

const LIST_CONFIG = { filterKeys: ['type', 'balance'] as const };

const TYPE_FILTERS = [
  { value: '', label: 'Tüm cariler' },
  { value: 'CUSTOMER', label: 'Müşteriler' },
  { value: 'SUPPLIER', label: 'Tedarikçiler' },
] as const;

const BALANCE_FILTERS = [
  { value: '', label: 'Tüm bakiyeler' },
  { value: 'debtor', label: 'Bize borçlu' },
  { value: 'creditor', label: 'Biz borçluyuz' },
] as const;

/** Cari listesi: bakiye, veresiye riski ve borçlu/alacaklı filtresi. */
export function ContactList(): ReactElement {
  const { params, setPage, setLimit, setSearch, setFilter } = useListParams(LIST_CONFIG);
  const contacts = useContacts(params);
  usePageClamp(contacts.data?.meta, setPage);
  const deleteContact = useDeleteContact();
  const toast = useToast();
  const canManage = usePermission(PERMISSIONS.CONTACT_MANAGE);

  const [editing, setEditing] = useState<Contact | null | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<Contact | null>(null);

  const columns = useMemo<Column<Contact>[]>(() => {
    const base: Column<Contact>[] = [
      {
        key: 'name',
        header: 'Cari',
        fixed: true,
        cell: (contact) => (
          <div className="flex flex-col">
            <Link href={`/contacts/${contact.id}`} className="text-ink font-medium hover:underline">
              {contact.name}
            </Link>
            {contact.code ? (
              <span className="text-ink-subtle tabular text-xs">{contact.code}</span>
            ) : null}
          </div>
        ),
      },
      {
        key: 'type',
        header: 'Tür',
        cell: (contact) => CONTACT_TYPE_LABELS[contact.type],
      },
      {
        key: 'phone',
        header: 'Telefon',
        cell: (contact) => <span className="tabular">{contact.phone ?? '—'}</span>,
      },
      {
        key: 'creditLimit',
        header: 'Veresiye limiti',
        numeric: true,
        cell: (contact) =>
          Number.parseFloat(contact.creditLimit) > 0 ? formatMoney(contact.creditLimit) : '—',
      },
      {
        key: 'balance',
        header: 'Bakiye',
        numeric: true,
        cell: (contact) => {
          const view = balanceView(contact.balance);
          if (view.direction === 'settled') return <span className="text-ink-subtle">—</span>;
          return (
            <span
              className={
                view.direction === 'receivable'
                  ? 'text-danger font-medium'
                  : 'text-warning font-medium'
              }
            >
              {formatMoney(view.amount)}
            </span>
          );
        },
      },
      {
        key: 'status',
        header: 'Durum',
        cell: (contact) => {
          const view = balanceView(contact.balance);
          if (isOverCreditLimit(contact)) return <Badge tone="danger">Limit aşıldı</Badge>;
          if (view.direction === 'settled') return <Badge tone="success">Kapalı</Badge>;
          return (
            <Badge tone={view.direction === 'receivable' ? 'warning' : 'neutral'}>
              {view.label}
            </Badge>
          );
        },
      },
    ];

    if (!canManage) return base;

    return [
      ...base,
      {
        key: 'actions',
        header: 'İşlem',
        className: 'w-24',
        cell: (contact) => (
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={`${contact.name} carisini düzenle`}
              onClick={() => {
                setEditing(contact);
              }}
              className="rounded-control text-ink-muted hover:bg-surface-sunken hover:text-ink inline-flex size-8 items-center justify-center"
            >
              <PencilLine className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-label={`${contact.name} carisini sil`}
              onClick={() => {
                setPendingDelete(contact);
              }}
              className="rounded-control text-ink-muted hover:bg-danger-weak hover:text-danger inline-flex size-8 items-center justify-center"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>
        ),
      },
    ];
  }, [canManage]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cariler"
        description="Müşteri ve tedarikçi hesapları, veresiye bakiyeleri."
        actions={
          <>
            <LinkButton href="/contacts/receivables" variant="outline">
              <Wallet className="size-4" aria-hidden />
              Veresiye defteri
            </LinkButton>
            <Can permission={PERMISSIONS.CONTACT_MANAGE}>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                }}
                className="rounded-control bg-brand text-brand-ink hover:bg-brand-hover inline-flex h-10 items-center gap-2 px-4 text-sm font-medium"
              >
                <UserPlus className="size-4" aria-hidden />
                Yeni cari
              </button>
            </Can>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={params.search}
          onChange={setSearch}
          placeholder="Cari adı, kodu veya vergi no"
          className="min-w-64 flex-1"
        />
        <Select
          className="w-44"
          aria-label="Cari türü filtresi"
          value={params.filters.type ?? ''}
          onChange={(e) => {
            setFilter('type', e.target.value);
          }}
        >
          {TYPE_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <Select
          className="w-44"
          aria-label="Bakiye filtresi"
          value={params.filters.balance ?? ''}
          onChange={(e) => {
            setFilter('balance', e.target.value);
          }}
        >
          {BALANCE_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <DataTable
        columns={columns}
        rows={contacts.data?.items ?? []}
        rowKey={(contact) => contact.id}
        loading={contacts.isPending}
        error={contacts.isError ? apiErrorMessage(contacts.error) : null}
        onRetry={() => {
          void contacts.refetch();
        }}
        rowClassName={(contact) => (isOverCreditLimit(contact) ? 'bg-danger-weak/40' : undefined)}
        empty={
          <EmptyState
            icon={BookUser}
            title={params.search ? 'Eşleşen cari yok' : 'Henüz cari yok'}
            description={
              params.search
                ? 'Arama veya filtreleri değiştirip tekrar deneyin.'
                : 'Veresiye defterini kullanmak için önce müşteri veya tedarikçi ekleyin.'
            }
          />
        }
      />

      <PaginationBar meta={contacts.data?.meta} onPageChange={setPage} onLimitChange={setLimit} />

      <ContactFormDialog
        contact={editing}
        onClose={() => {
          setEditing(undefined);
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Cariyi sil"
        description={`"${pendingDelete?.name ?? ''}" silinecek. Bakiyesi olan cari silinemez; önce hesabı kapatın.`}
        confirmLabel="Sil"
        destructive
        loading={deleteContact.isPending}
        onConfirm={() => {
          if (!pendingDelete) return;
          const name = pendingDelete.name;
          deleteContact.mutate(pendingDelete.id, {
            onSuccess: () => {
              toast.success('Cari silindi', name);
              setPendingDelete(null);
            },
            onError: (error) => {
              toast.error('Cari silinemedi', apiErrorMessage(error));
            },
          });
        }}
        onClose={() => {
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
