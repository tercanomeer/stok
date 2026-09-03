'use client';

import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement } from 'react';

import { Button, useToast } from '@stokk/ui';

import { useCreateExport, useExportJob, type ExportPayload } from '../../hooks/use-reports';
import { apiDownload, apiErrorMessage } from '../../lib/api';

export interface ExportButtonProps {
  payload: Omit<ExportPayload, 'format'>;
  /** Yetkisi olmayan kullanıcıda buton hiç render edilmez. */
  disabled?: boolean;
}

/**
 * Rapor dışa aktarma. İş kuyrukta hazırlanır (büyük rapor isteği bloklamasın),
 * durum yoklanır, hazır olunca dosya indirilir.
 *
 * Dosya nesne deposunda ÖZELdir; adresi doğrudan açmak 403 verir. Bu yüzden
 * indirme, Authorization başlığı taşıyan `/exports/:id/file` ucundan yapılır.
 */
export function ExportButton({ payload, disabled = false }: ExportButtonProps): ReactElement {
  const createExport = useCreateExport();
  const toast = useToast();
  const [jobId, setJobId] = useState<string | null>(null);
  const [format, setFormat] = useState<'XLSX' | 'PDF' | null>(null);
  const job = useExportJob(jobId);
  // Aynı iş için dosya bir kez açılsın: effect yalnız yan etki yapar, state yazmaz
  // (state yazmak yeni render → yeniden açma zincirine yol açardı).
  const handled = useRef<string | null>(null);

  const status = job.data?.status;
  const errorMessage = job.data?.errorMessage ?? null;

  useEffect(() => {
    if (!jobId || handled.current === jobId) return;
    if (status === 'COMPLETED') {
      handled.current = jobId;
      const extension = job.data?.format === 'PDF' ? 'pdf' : 'xlsx';
      void apiDownload(`/exports/${jobId}/file`, `${payload.report}.${extension}`)
        .then(() => {
          toast.success('Rapor indirildi');
        })
        .catch((error: unknown) => {
          toast.error('Rapor indirilemedi', apiErrorMessage(error));
        });
    } else if (status === 'FAILED') {
      handled.current = jobId;
      toast.error('Rapor oluşturulamadı', errorMessage ?? undefined);
    }
    // `toast`/`payload` bağımlılığa girerse her render tetiklenir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, status, errorMessage]);

  function start(next: 'XLSX' | 'PDF'): void {
    setFormat(next);
    createExport.mutate(
      { ...payload, format: next },
      {
        onSuccess: (result) => {
          setJobId(result.jobId);
        },
        onError: (error) => {
          setFormat(null);
          toast.error('Rapor isteği başarısız', apiErrorMessage(error));
        },
      },
    );
  }

  // İş bitince (COMPLETED/FAILED) buton serbest kalır; jobId sıfırlamaya gerek yok.
  const busy =
    createExport.isPending || (jobId !== null && status !== 'COMPLETED' && status !== 'FAILED');

  return (
    <div className="flex items-center gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={disabled || busy}
        loading={busy && format === 'XLSX'}
        onClick={() => {
          start('XLSX');
        }}
      >
        <FileSpreadsheet aria-hidden />
        Excel
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled || busy}
        loading={busy && format === 'PDF'}
        onClick={() => {
          start('PDF');
        }}
      >
        <FileText aria-hidden />
        PDF
      </Button>
      {busy ? (
        <span className="text-ink-muted flex items-center gap-1 text-xs" role="status">
          <Download className="size-3" aria-hidden />
          Hazırlanıyor…
        </span>
      ) : null}
    </div>
  );
}
