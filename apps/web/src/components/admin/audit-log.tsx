'use client';

import { ScrollText } from 'lucide-react';
import { useMemo, type ReactElement } from 'react';

import { Badge, Button, EmptyState, formatDateTime, Input, Select } from '@stokk/ui';

import { SettingsTabs } from './settings-tabs';
import { useAuditLogs, useUsers } from '../../hooks/use-admin';
import { useListParams } from '../../hooks/use-list-params';
import { usePageClamp } from '../../hooks/use-page-clamp';
import { apiErrorMessage } from '../../lib/api';
import type { AuditAction, AuditLogRow } from '../../lib/api-types';
import { dateToIsoEnd, dateToIsoStart, isoToDateInput } from '../../lib/stock-labels';
import { DataTable, type Column } from '../common/data-table';
import { PageHeader } from '../common/page-header';
import { PaginationBar } from '../common/pagination-bar';
import { SearchInput } from '../common/search-input';

const LIST_CONFIG = { filterKeys: ['action', 'entity', 'userId', 'from', 'to'] as const };

const ACTION_LABELS: Record<
  AuditAction,
  { label: string; tone: 'success' | 'brand' | 'danger' | 'neutral' }
> = {
  CREATE: { label: 'Oluşturma', tone: 'success' },
  UPDATE: { label: 'Güncelleme', tone: 'brand' },
  DELETE: { label: 'Silme', tone: 'danger' },
  LOGIN: { label: 'Giriş', tone: 'neutral' },
  LOGOUT: { label: 'Çıkış', tone: 'neutral' },
  LOGIN_FAILED: { label: 'Başarısız giriş', tone: 'danger' },
};

/**
 * Denetim kaydı görüntüleyici — kim, ne zaman, neyi değiştirdi.
 * Salt okunur: kayıt ekrandan düzenlenemez, silinemez. Şifre/kart gibi PII
 * sunucuda zaten redakte edilerek yazılıyor (CLAUDE.md).
 */
export function AuditLogView(): ReactElement {
  const { params, setPage, setLimit, setSearch, setFilter, reset } = useListParams(LIST_CONFIG);
  const logs = useAuditLogs(params);
  usePageClamp(logs.data?.meta, setPage);
  const users = useUsers();

  const columns = useMemo<Column<AuditLogRow>[]>(
    () => [
      {
        key: 'createdAt',
        header: 'Zaman',
        fixed: true,
        cell: (row) => <span className="tabular">{formatDateTime(row.createdAt)}</span>,
      },
      {
        key: 'user',
        header: 'Kullanıcı',
        cell: (row) => row.user?.fullName ?? <span className="text-ink-subtle">Sistem</span>,
      },
      {
        key: 'action',
        header: 'İşlem',
        cell: (row) => (
          <Badge tone={ACTION_LABELS[row.action].tone}>{ACTION_LABELS[row.action].label}</Badge>
        ),
      },
      { key: 'entity', header: 'Varlık', cell: (row) => row.entity },
      {
        key: 'entityId',
        header: 'Kayıt',
        cell: (row) => <span className="tabular text-xs">{row.entityId ?? '—'}</span>,
      },
      {
        key: 'changes',
        header: 'Değişiklik',
        cell: (row) =>
          row.changes === null || row.changes === undefined ? (
            '—'
          ) : (
            <code className="text-ink-muted block max-w-md truncate text-xs">
              {JSON.stringify(row.changes)}
            </code>
          ),
      },
      {
        key: 'ipAddress',
        header: 'IP',
        cell: (row) => <span className="tabular text-xs">{row.ipAddress ?? '—'}</span>,
      },
    ],
    [],
  );

  const hasFilters = Object.values(params.filters).some(Boolean) || params.search !== '';

  return (
    <div className="space-y-5">
      <PageHeader
        title="Denetim kaydı"
        description="Kritik işlemlerin kim, ne zaman, ne yaptı kaydı. Salt okunur."
      />
      <SettingsTabs />

      <div className="flex flex-wrap items-end gap-2">
        <SearchInput
          value={params.search}
          onChange={setSearch}
          placeholder="Varlık veya kayıt no"
          className="min-w-52"
        />

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink font-medium">İşlem</span>
          <Select
            className="w-44"
            value={params.filters.action ?? ''}
            onChange={(e) => {
              setFilter('action', e.target.value);
            }}
          >
            <option value="">Tüm işlemler</option>
            {Object.entries(ACTION_LABELS).map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </Select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink font-medium">Kullanıcı</span>
          <Select
            className="w-44"
            value={params.filters.userId ?? ''}
            onChange={(e) => {
              setFilter('userId', e.target.value);
            }}
          >
            <option value="">Tüm kullanıcılar</option>
            {(users.data ?? []).map((user) => (
              <option key={user.id} value={user.id}>
                {user.fullName}
              </option>
            ))}
          </Select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink font-medium">Başlangıç</span>
          <Input
            type="date"
            className="w-40"
            value={isoToDateInput(params.filters.from)}
            onChange={(e) => {
              setFilter('from', dateToIsoStart(e.target.value) ?? '');
            }}
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink font-medium">Bitiş</span>
          <Input
            type="date"
            className="w-40"
            value={isoToDateInput(params.filters.to)}
            onChange={(e) => {
              setFilter('to', dateToIsoEnd(e.target.value) ?? '');
            }}
          />
        </label>

        {hasFilters ? (
          <Button variant="ghost" onClick={reset}>
            Filtreleri temizle
          </Button>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        rows={logs.data?.items ?? []}
        rowKey={(row) => row.id}
        loading={logs.isPending}
        error={logs.isError ? apiErrorMessage(logs.error) : null}
        onRetry={() => {
          void logs.refetch();
        }}
        empty={
          <EmptyState
            icon={ScrollText}
            title="Denetim kaydı yok"
            description="Ürün, satış, ayar gibi kritik işlemler yapıldıkça buraya düşer."
          />
        }
      />

      <PaginationBar meta={logs.data?.meta} onPageChange={setPage} onLimitChange={setLimit} />
    </div>
  );
}
