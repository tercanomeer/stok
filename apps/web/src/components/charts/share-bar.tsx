'use client';

import type { ReactElement } from 'react';

import { MAX_CATEGORICAL_SLOTS, VIZ_SLOT_VARS } from './chart-tokens';

export interface ShareSlice {
  id: string;
  label: string;
  /** 0-100 arası yüzde (string olarak API'den gelir). */
  pct: string;
  display: string;
}

export interface ShareBarProps {
  slices: ShareSlice[];
  title: string;
}

/**
 * Parça-bütün: tek yatay yığılmış çubuk (dataviz: "part-to-whole → stacked bar").
 *
 * Kategorik palet SABİT sırayla atanır, döngüye sokulmaz; 4 slottan fazlası
 * "Diğer"e katlanır (üretilmiş 9. renk CVD altında ayırt edilemez).
 * Açık temada kontrast uyarısı olduğu için hem LEJANT hem DEĞER etiketleri
 * her zaman görünür — kimlik hiçbir zaman yalnız renkle taşınmaz.
 * Segmentler arasında 2px yüzey boşluğu var.
 */
export function ShareBar({ slices, title }: ShareBarProps): ReactElement {
  if (slices.length === 0) {
    return <p className="text-ink-muted py-8 text-center text-sm">Bu aralıkta veri yok.</p>;
  }

  // Slot sayısını aşan sınıflar GERÇEKTEN "Diğer"e katlanır: üretilmiş 5. renk CVD
  // altında ayırt edilemez. Katlama hem çubukta hem tabloda aynı — görsel ile
  // ekran okuyucu farklı veri görmez.
  const visible: ShareSlice[] =
    slices.length <= MAX_CATEGORICAL_SLOTS
      ? slices
      : [
          ...slices.slice(0, MAX_CATEGORICAL_SLOTS - 1),
          {
            id: 'other',
            label: 'Diğer',
            pct: slices
              .slice(MAX_CATEGORICAL_SLOTS - 1)
              .reduce((sum, slice) => sum + (Number.parseFloat(slice.pct) || 0), 0)
              .toFixed(2),
            display: `${String(slices.length - MAX_CATEGORICAL_SLOTS + 1)} kalem`,
          },
        ];

  return (
    <div className="space-y-3">
      <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded-full" role="presentation">
        {visible.map((slice, index) => {
          const pct = Number.parseFloat(slice.pct);
          return (
            <div
              key={slice.id}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{
                width: `${String(Number.isFinite(pct) ? Math.max(pct, 0) : 0)}%`,
                backgroundColor: VIZ_SLOT_VARS[index % VIZ_SLOT_VARS.length],
              }}
            />
          );
        })}
      </div>

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {visible.map((slice, index) => (
          <li key={slice.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: VIZ_SLOT_VARS[index % VIZ_SLOT_VARS.length] }}
              />
              <span className="text-ink">{slice.label}</span>
            </span>
            <span className="text-ink-muted tabular">
              {slice.display} · %{slice.pct}
            </span>
          </li>
        ))}
      </ul>

      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Yöntem</th>
            <th scope="col">Tutar</th>
            <th scope="col">Pay</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((slice) => (
            <tr key={slice.id}>
              <th scope="row">{slice.label}</th>
              <td>{slice.display}</td>
              <td>%{slice.pct}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
