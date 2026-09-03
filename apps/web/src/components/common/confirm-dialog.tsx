'use client';

import type { ReactElement } from 'react';

import { Button, Dialog } from '@stokk/ui';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  /** Geri alınamaz işlem: onay butonu danger olur. */
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** Geri alınamaz işlemler için onay kapısı (silme, sayım tamamlama/iptal). */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Onayla',
  destructive = false,
  loading = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps): ReactElement {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      closeDisabled={loading}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Vazgeç
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-ink-muted text-sm">{description}</p>
    </Dialog>
  );
}
