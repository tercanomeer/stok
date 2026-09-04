import type { ContactSummary } from '@shared/ipc-contracts';
import { useEffect, useRef, useState, type ReactElement } from 'react';

import { Button, Dialog, EmptyState, Input, formatMoney } from '@stokk/ui';


import { bridge, errorMessage, unwrap } from '../../lib/bridge';
import type { CartCustomer } from '../../store/cart-store';

interface CustomerDialogProps {
  onClose: () => void;
  onSelect: (customer: CartCustomer) => void;
}

/**
 * Müşteri seçimi (F2) — veresiye satışın ön koşulu.
 *
 * Cari listesi POS'ta önbelleklenmiyor: bakiye ve kredi limiti canlı veridir,
 * eski bir kopyaya bakıp limit aşımına izin vermek gerçek bir zarardır. Bu yüzden
 * çevrimdışıyken arama açıkça "bağlantı gerekli" der.
 */
export function CustomerDialog({ onClose, onSelect }: CustomerDialogProps): ReactElement {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ContactSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Modal yalnız açıkken mount ediliyor; state her açılışta temiz başlıyor.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Kasiyer yazarken her tuşta sunucuya gitmemek için 250 ms bekleniyor.
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      unwrap(bridge().contacts.search(query))
        .then((items) => {
          if (active) {
            setResults(items);
            setError(null);
          }
        })
        .catch((searchError: unknown) => {
          if (active) {
            setResults([]);
            setError(errorMessage(searchError, 'Müşteriler getirilemedi.'));
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <Dialog open onClose={onClose} title="Müşteri seç" description="Veresiye satış için gerekli.">
      <div className="flex flex-col gap-3">
        <Input
          ref={inputRef}
          value={query}
          placeholder="Ad ya da telefon"
          aria-label="Müşteri ara"
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />

        {error ? (
          <p className="text-danger text-sm" role="alert">
            {error}
          </p>
        ) : null}

        {!error && results.length === 0 && !loading ? (
          <EmptyState title="Müşteri bulunamadı" />
        ) : null}

        <ul className="divide-border max-h-72 divide-y overflow-y-auto">
          {results.map((contact) => (
            <li key={contact.id}>
              <button
                type="button"
                className="hover:bg-surface-sunken flex w-full items-center gap-3 px-2 py-2 text-left"
                onClick={() => {
                  onSelect({ id: contact.id, name: contact.name });
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="text-ink block truncate font-medium">{contact.name}</span>
                  {contact.phone ? (
                    <span className="text-ink-muted block text-xs">{contact.phone}</span>
                  ) : null}
                </span>
                <span className="text-right text-sm">
                  <span className="text-ink-muted block text-xs">Bakiye</span>
                  <span className="text-ink tabular-nums">{formatMoney(contact.balance)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Kapat (Esc)
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
