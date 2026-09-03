'use client';

import { useEffect, useState } from 'react';

/**
 * Gecikmeli değer — her tuş vuruşunda sunucuya gitmemek için.
 * Kasa/panel aramasında 300 ms yeterli: yazarken sorgu patlamaz, duraksayınca sonuç gelir.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debounced;
}
