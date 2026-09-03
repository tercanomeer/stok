'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ClipboardList, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';

import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  Field,
  formatCount,
  formatDateTime,
  Textarea,
  useToast,
} from '@stokk/ui';

import { StockTabs } from './stock-tabs';
import { useStartCount, useStockCounts } from '../../hooks/use-stock';
import { apiErrorMessage } from '../../lib/api';
import type { StockCountListItem, StockCountStatus } from '../../lib/api-types';
import { startCountSchema, type StartCountValues } from '../../lib/catalog-schemas';
import { DataTable, type Column } from '../common/data-table';
import { PageHeader } from '../common/page-header';
import { FormBanner } from '../form-banner';

const STATUS: Record<StockCountStatus, { label: string; tone: 'brand' | 'success' | 'neutral' }> = {
  IN_PROGRESS: { label: 'Devam ediyor', tone: 'brand' },
  COMPLETED: { label: 'Tamamlandı', tone: 'success' },
  CANCELLED: { label: 'İptal', tone: 'neutral' },
};

/** Sayım listesi + yeni sayım başlatma. Başlatılan sayım doğrudan giriş ekranına götürür. */
export function CountList(): ReactElement {
  const counts = useStockCounts();
  const startCount = useStartCount();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<StartCountValues>({
    resolver: zodResolver(startCountSchema),
    defaultValues: { note: '' },
  });

  const onSubmit = handleSubmit((values) => {
    startCount.mutate(
      { ...(values.note ? { note: values.note } : {}) },
      {
        onSuccess: (created) => {
          toast.success('Sayım başlatıldı', created.code);
          setOpen(false);
          router.push(`/stock/counts/${created.id}`);
        },
      },
    );
  });

  const columns: Column<StockCountListItem>[] = [
    {
      key: 'code',
      header: 'Sayım',
      fixed: true,
      cell: (count) => (
        <Link href={`/stock/counts/${count.id}`} className="text-ink font-medium hover:underline">
          {count.code}
        </Link>
      ),
    },
    {
      key: 'status',
      header: 'Durum',
      cell: (count) => <Badge tone={STATUS[count.status].tone}>{STATUS[count.status].label}</Badge>,
    },
    {
      key: 'items',
      header: 'Kalem',
      numeric: true,
      cell: (count) => formatCount(count._count.items),
    },
    {
      key: 'startedAt',
      header: 'Başlangıç',
      cell: (count) => <span className="tabular">{formatDateTime(count.startedAt)}</span>,
    },
    {
      key: 'completedAt',
      header: 'Bitiş',
      cell: (count) =>
        count.completedAt ? (
          <span className="tabular">{formatDateTime(count.completedAt)}</span>
        ) : (
          '—'
        ),
    },
    { key: 'note', header: 'Not', cell: (count) => count.note ?? '—' },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sayımlar"
        description="Sayım sürerken stok değişmez; fark yalnız tamamlayınca tek hareketle yazılır."
        actions={
          <Button
            onClick={() => {
              reset({ note: '' });
              startCount.reset();
              setOpen(true);
            }}
          >
            <Plus aria-hidden />
            Sayım başlat
          </Button>
        }
      />
      <StockTabs />

      <DataTable
        columns={columns}
        rows={counts.data ?? []}
        rowKey={(count) => count.id}
        loading={counts.isPending}
        error={counts.isError ? apiErrorMessage(counts.error) : null}
        onRetry={() => {
          void counts.refetch();
        }}
        empty={
          <EmptyState
            icon={ClipboardList}
            title="Henüz sayım yapılmadı"
            description="Sayım başlatın, ürünleri barkodla okutun, farkı tek seferde stoğa yazın."
          />
        }
      />

      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title="Sayım başlat"
        description="Sayım süresince stok değişmez. Bitirince fark tek hareketle işlenir."
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false);
              }}
            >
              Vazgeç
            </Button>
            <Button
              loading={startCount.isPending}
              onClick={() => {
                void onSubmit();
              }}
            >
              Başlat
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {startCount.isError ? <FormBanner message={apiErrorMessage(startCount.error)} /> : null}
          <Field label="Not" error={errors.note?.message} hint="Örnek: raf 3 sayımı, ay sonu.">
            {({ id, describedBy }) => (
              <Textarea id={id} autoFocus aria-describedby={describedBy} {...register('note')} />
            )}
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
