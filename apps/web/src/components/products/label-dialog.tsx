'use client';

import { ExternalLink, Tags } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { Button, Dialog, formatCount, useToast } from '@stokk/ui';

import { useGenerateLabels } from '../../hooks/use-products';
import { apiErrorMessage } from '../../lib/api';
import { FormBanner } from '../form-banner';

export interface LabelDialogProps {
  open: boolean;
  productIds: string[];
  onClose: () => void;
}

/**
 * Etiket basımı: seçim → sayfa düzeni → PDF. Düzen sunucuda sabittir
 * (A4, 3 sütun × 8 satır, CODE128); burada kaç sayfa çıkacağı önden gösterilir.
 * Birincil barkodu olmayan ürün etiket almaz — sonuç adedi bunu yansıtır.
 */
export function LabelDialog({ open, productIds, onClose }: LabelDialogProps): ReactElement {
  const labels = useGenerateLabels();
  const toast = useToast();
  const [url, setUrl] = useState<string | null>(null);

  const perPage = 24;
  const pages = Math.max(1, Math.ceil(productIds.length / perPage));

  function handleGenerate(): void {
    labels.mutate(productIds, {
      onSuccess: (result) => {
        setUrl(result.url);
        toast.success('Etiket PDF hazır', `${formatCount(result.count)} etiket oluşturuldu.`);
      },
    });
  }

  function handleClose(): void {
    setUrl(null);
    labels.reset();
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Etiket bas"
      description="Seçili ürünlerin birincil barkodundan yazdırılabilir PDF üretilir."
      footer={
        url ? (
          <>
            <Button variant="outline" onClick={handleClose}>
              Kapat
            </Button>
            <Button
              onClick={() => {
                window.open(url, '_blank', 'noopener');
              }}
            >
              <ExternalLink aria-hidden />
              PDF'i aç
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={handleClose}>
              Vazgeç
            </Button>
            <Button
              loading={labels.isPending}
              disabled={productIds.length === 0}
              onClick={handleGenerate}
            >
              <Tags aria-hidden />
              PDF oluştur
            </Button>
          </>
        )
      }
    >
      <div className="space-y-3">
        {labels.isError ? <FormBanner message={apiErrorMessage(labels.error)} /> : null}

        <dl className="divide-border border-border rounded-control divide-y border text-sm">
          <div className="flex justify-between px-3 py-2">
            <dt className="text-ink-muted">Seçili ürün</dt>
            <dd className="tabular font-medium">{formatCount(productIds.length)}</dd>
          </div>
          <div className="flex justify-between px-3 py-2">
            <dt className="text-ink-muted">Sayfa düzeni</dt>
            <dd>A4 · 3 sütun × 8 satır</dd>
          </div>
          <div className="flex justify-between px-3 py-2">
            <dt className="text-ink-muted">Tahmini sayfa</dt>
            <dd className="tabular font-medium">{formatCount(pages)}</dd>
          </div>
        </dl>

        <p className="text-ink-muted text-sm">
          Birincil barkodu olmayan ürünler atlanır. Yazdırmadan önce PDF'i önizleyin.
        </p>
      </div>
    </Dialog>
  );
}
