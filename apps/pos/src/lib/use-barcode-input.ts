import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';

/** Barkod okuyucu bu süre kadar sessiz kalırsa okuma bitmiş sayılır (04-fazlar.md). */
const QUIET_MS = 150;

/**
 * Elle yazan kasiyerin araya sıkışmasını engelleyen alt sınır: tek harflik bir arama
 * ifadesi barkod sanılıp katalogda aranmasın.
 */
const MIN_LENGTH = 4;

export interface BarcodeInput {
  value: string;
  // Metod değil OK FONKSİYON alanları: JSX'te `barcode.onChange` diye geçirilince
  // `this` bağlaması sorusu doğmasın (@typescript-eslint/unbound-method).
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  /** Alanı odaklar ve içeriğini seçer — her satırdan sonra çağrılır. */
  focus: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  reset: () => void;
}

/**
 * Barkod alanı.
 *
 * Okuyucu, barkodu tuş tuş "yazar" ve çoğu model sonunda Enter gönderir. Enter'a
 * güvenmek yetmiyor: Enter göndermeyen modeller var ve kasiyer barkodu elle de
 * yazabiliyor. Bu yüzden iki tetik var — Enter, ya da 150 ms sessizlik.
 *
 * Sessizlik zamanlayıcısı her tuşta sıfırlanır; okuyucu tüm haneleri milisaniyeler
 * içinde bastığı için tetik ancak okuma bittiğinde çalışır.
 */
export function useBarcodeInput(onScan: (code: string) => void): BarcodeInput {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Zamanlayıcı kurulduğu andaki `onScan`'i değil GÜNCELİNİ çağırsın: sepet
  // değiştikçe callback yeniden yaratılıyor. Güncelleme render sırasında değil
  // effect'te yapılır — render saf kalsın.
  const handler = useRef(onScan);
  useEffect(() => {
    handler.current = onScan;
  }, [onScan]);

  const cancel = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => cancel, [cancel]);

  const fire = useCallback(
    (code: string) => {
      cancel();
      const trimmed = code.trim();
      setValue('');
      if (trimmed.length > 0) handler.current(trimmed);
    },
    [cancel],
  );

  const onChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value;
      setValue(next);
      cancel();
      if (next.trim().length < MIN_LENGTH) return;
      timer.current = setTimeout(() => {
        fire(next);
      }, QUIET_MS);
    },
    [cancel, fire],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      fire(event.currentTarget.value);
    },
    [fire],
  );

  const focus = useCallback(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const reset = useCallback(() => {
    cancel();
    setValue('');
  }, [cancel]);

  return { value, onChange, onKeyDown, focus, inputRef, reset };
}
