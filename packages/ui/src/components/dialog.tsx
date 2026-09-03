'use client';

import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactElement, type ReactNode } from 'react';

import { cn } from '../lib/cn.js';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string | undefined;
  children: ReactNode;
  /** Alt aksiyon çubuğu (butonlar). */
  footer?: ReactNode;
  /**
   * Kapatmayı kilitler. Geri alınamaz bir istek uçuştayken kullanıcı Esc, backdrop
   * ya da X ile dialogu kapatıp işlemi "durdurduğunu" sanmasın: istek zaten gitti.
   */
  closeDisabled?: boolean;
  className?: string;
}

/**
 * Yerel `<dialog>` tabanlı modal — odak tuzağı, Esc ile kapanış ve `::backdrop`
 * tarayıcıdan gelir (ek ARIA/kütüphane gerekmez). `showModal()`/`close()` open
 * prop'una göre sürülür; backdrop tıklaması ve Esc `onClose`'a bağlanır.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  closeDisabled = false,
  className,
}: DialogProps): ReactElement {
  const ref = useRef<HTMLDialogElement>(null);
  // Bir ekranda birden fazla Dialog mount olabilir (fire + düzeltme + onay).
  // Sabit id kullanılırsa DOM'da kopya id oluşur ve aria-labelledby yanlış
  // başlığa bağlanır; her örnek kendi id'sini üretir.
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        // preventDefault her durumda: kilitliyken Esc dialogu kapatmamalı.
        e.preventDefault();
        if (!closeDisabled) onClose();
      }}
      onClick={(e) => {
        // Backdrop (dialog elementinin kendisi) tıklaması kapatır; içerik değil.
        if (e.target === ref.current && !closeDisabled) onClose();
      }}
      className={cn(
        'rounded-panel border-border bg-surface-raised text-ink m-auto w-[min(32rem,calc(100vw-2rem))] border p-0 shadow-[var(--shadow-overlay)]',
        'backdrop:bg-black/40',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 p-5 pb-0">
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          {description ? <p className="text-ink-muted text-sm">{description}</p> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={closeDisabled}
          aria-label="Kapat"
          className="rounded-control text-ink-muted hover:bg-surface-sunken hover:text-ink p-1 disabled:pointer-events-none disabled:opacity-50"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>
      <div className="p-5">{children}</div>
      {footer ? (
        <div className="border-border flex justify-end gap-2 border-t p-4">{footer}</div>
      ) : null}
    </dialog>
  );
}
