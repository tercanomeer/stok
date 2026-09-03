'use client';

import { Search, X } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';

import { Input } from '@stokk/ui';

import { useDebouncedValue } from '../../hooks/use-debounced-value';

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Ekran açılışında odaklan (sayım/barkod ekranları). */
  autoFocus?: boolean;
  className?: string;
}

/**
 * Gecikmeli arama kutusu. Yazarken yerel durum anında güncellenir (imleç takılmaz),
 * sunucuya yalnız duraksayınca gider. Dışarıdan gelen değer (URL/geri tuşu) yerel
 * durumu tazeler.
 */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Ara…',
  autoFocus = false,
  className,
}: SearchInputProps): ReactElement {
  const [text, setText] = useState(value);
  const [lastExternal, setLastExternal] = useState(value);
  const debounced = useDebouncedValue(text);

  // Dışarıdan GERÇEKTEN gelen değer (geri tuşu, filtre sıfırlama, başka linkten giriş)
  // yerel metni tazeler. React'in "prop değişince state'i ayarla" deseni: effect değil,
  // render sırasında.
  //
  // `value === debounced` ise bu bizim KENDİ yankımızdır: gecikmeli terim URL'e
  // yazıldı ve prop olarak geri geldi. Yankıyı yok saymazsak, kullanıcının o arada
  // yazdığı yeni harfler eski terimle ezilir (hızlı yazanda tuş kaybı).
  if (value !== lastExternal) {
    setLastExternal(value);
    if (value !== debounced) setText(value);
  }

  useEffect(() => {
    if (debounced !== value) onChange(debounced);
    // `value` bağımlılığa girerse dış güncelleme sonsuz döngü kurar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return (
    <div className={className}>
      <div className="relative">
        <Search
          className="text-ink-subtle pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          type="search"
          value={text}
          autoFocus={autoFocus}
          aria-label={placeholder}
          placeholder={placeholder}
          onChange={(e) => {
            setText(e.target.value);
          }}
          className="pr-9 pl-9"
        />
        {text ? (
          <button
            type="button"
            aria-label="Aramayı temizle"
            onClick={() => {
              setText('');
            }}
            className="rounded-control text-ink-muted hover:bg-surface-sunken hover:text-ink absolute top-1/2 right-2 -translate-y-1/2 p-1"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  );
}
