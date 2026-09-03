'use client';

import { Check, Minus } from 'lucide-react';
import { useEffect, useRef, type InputHTMLAttributes, type ReactElement, type Ref } from 'react';

import { cn } from '../lib/cn.js';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Kısmi seçim (liste başlığında "bazıları seçili"). */
  indeterminate?: boolean;
  ref?: Ref<HTMLInputElement>;
}

/**
 * Yerel `<input type="checkbox">` üstüne çizilen kutu — klavye ve okuyucu davranışı
 * tarayıcıdan gelir. Girdi saydam olduğu için kendi odak halkası çizilmez; halka
 * `peer-focus-visible` ile görünür kutuya taşınır.
 *
 * İşaret CSS ile sürülür (`peer-checked`/`peer-indeterminate`), React durumuyla değil:
 * bileşen hem kontrollü kullanımda hem react-hook-form'un kontrolsüz `register`'ında
 * doğru görünür. Kutu ve işaretler girdinin KARDEŞİ olmalı — `peer-*` yalnız kardeşe işler.
 * `indeterminate` bir DOM özelliğidir, attribute değil; effect ile yazılır.
 */
export function Checkbox({
  className,
  indeterminate = false,
  ref,
  ...props
}: CheckboxProps): ReactElement {
  const inner = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inner.current) inner.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <span
      className={cn('relative inline-flex size-4 shrink-0 items-center justify-center', className)}
    >
      <input
        ref={(node) => {
          inner.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) ref.current = node;
        }}
        type="checkbox"
        className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        {...props}
      />
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 rounded-[0.25rem] border transition-colors',
          'border-border-strong bg-surface-raised',
          'peer-checked:border-brand peer-checked:bg-brand',
          'peer-indeterminate:border-brand peer-indeterminate:bg-brand',
          'peer-focus-visible:outline-brand peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2',
          'peer-disabled:opacity-60',
        )}
      />
      <Check
        aria-hidden
        strokeWidth={3}
        className="text-brand-ink pointer-events-none hidden size-3 peer-checked:block peer-indeterminate:hidden"
      />
      <Minus
        aria-hidden
        strokeWidth={3}
        className="text-brand-ink pointer-events-none hidden size-3 peer-indeterminate:block"
      />
    </span>
  );
}
