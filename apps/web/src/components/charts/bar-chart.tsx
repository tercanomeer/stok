'use client';

import { useId, useState, type ReactElement } from 'react';

import { cn } from '@stokk/ui';

export interface BarDatum {
  /** Eksende görünen kısa etiket. */
  label: string;
  /** Sayısal değer — string (para/miktar API'den string gelir). */
  value: string;
  /** İpucunda gösterilecek biçimlenmiş değer. */
  display: string;
  /** İpucunda ikinci satır (ör. "12 satış"). */
  hint?: string;
}

export interface BarChartProps {
  data: BarDatum[];
  /** Ekran okuyucuya ne gösterdiğini anlatır; sr-only tablonun başlığı olur. */
  title: string;
  /** Değer sütununun başlığı (sr-only tabloda). */
  valueLabel: string;
  height?: number;
  className?: string;
}

const BAR_RADIUS = 4;
const BAR_GAP = 2;

/**
 * Tek serili sütun grafiği — büyüklük karşılaştırması (dataviz: "compare magnitude").
 *
 * Tek seri olduğu için lejant yok (başlık seriyi zaten adlandırır), renk marka
 * yeşili. Veri uçları 4px yuvarlatılmış ve tabana sabitlenmiş, sütunlar arasında
 * 2px yüzey boşluğu var. Değerler her sütunda YAZILMAZ; okuma ipucu (hover) ve
 * ekran okuyucu için gizli tablo ile verilir.
 */
export function BarChart({
  data,
  title,
  valueLabel,
  height = 220,
  className,
}: BarChartProps): ReactElement {
  const tableId = useId();
  const [active, setActive] = useState<number | null>(null);

  const values = data.map((d) => {
    const parsed = Number.parseFloat(d.value);
    return Number.isFinite(parsed) ? parsed : 0;
  });
  const max = Math.max(...values, 0);

  if (data.length === 0) {
    return <p className="text-ink-muted py-8 text-center text-sm">Bu aralıkta veri yok.</p>;
  }

  const slot = 100 / data.length;

  return (
    <div className={cn('relative', className)}>
      <svg
        viewBox={`0 0 100 ${String(height)}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        role="img"
        /*
         * Erişilebilir isim KISA olmalı: `aria-labelledby` ile tabloyu göstermek
         * caption + tüm hücreleri tek bir dev metne düzleştirir. Veri zaten hemen
         * altındaki gerçek tabloda, yapısıyla birlikte okunuyor.
         */
        aria-label={`${title} — sütun grafiği. Değerler için ok tuşlarıyla gezinin.`}
        /*
         * Klavye: grafiğin TAMAMI tek sekme durağı, sütunlar arasında ok tuşuyla
         * gezilir. Her sütunu ayrı ayrı odaklanabilir yapmak 24 sekme durağı üretir;
         * `aria-hidden` + `tabIndex` birlikte ise "odaklanabilir ama okuyucuya gizli"
         * ihlali doğurur. Sütunlar gizli kalır, gezinme kapsayıcıda toplanır.
         */
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            const step = e.key === 'ArrowRight' ? 1 : -1;
            setActive((prev) => {
              const next = (prev ?? (step > 0 ? -1 : data.length)) + step;
              return Math.min(Math.max(next, 0), data.length - 1);
            });
          } else if (e.key === 'Home') {
            e.preventDefault();
            setActive(0);
          } else if (e.key === 'End') {
            e.preventDefault();
            setActive(data.length - 1);
          } else if (e.key === 'Escape') {
            setActive(null);
          }
        }}
        onBlur={() => {
          setActive(null);
        }}
        onMouseLeave={() => {
          setActive(null);
        }}
      >
        {/* Taban çizgisi — geri planda, ince. */}
        <line
          x1="0"
          y1={height - 0.5}
          x2="100"
          y2={height - 0.5}
          className="stroke-border"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        {data.map((datum, index) => {
          const value = values[index] ?? 0;
          const barHeight = max > 0 ? Math.max((value / max) * (height - 8), value > 0 ? 2 : 0) : 0;
          const x = index * slot;
          return (
            <g key={datum.label}>
              {/* Vuruş alanı sütundan geniş: ince sütunda da ipucu yakalanır. */}
              <rect
                x={x}
                y={0}
                width={slot}
                height={height}
                fill="transparent"
                aria-hidden
                onMouseEnter={() => {
                  setActive(index);
                }}
              />
              <rect
                x={x + BAR_GAP / 2}
                y={height - barHeight}
                width={Math.max(slot - BAR_GAP, 0.5)}
                height={barHeight}
                rx={BAR_RADIUS}
                className={active === index ? 'fill-brand-hover' : 'fill-brand'}
                pointerEvents="none"
              />
            </g>
          );
        })}
      </svg>

      <div className="text-ink-subtle mt-1 flex text-[11px]">
        {data.map((datum, index) => (
          <span
            key={datum.label}
            className="truncate text-center"
            style={{ width: `${String(slot)}%` }}
            aria-hidden
          >
            {/* Kalabalık eksende her ikinci etiket gösterilir, üst üste binmesin. */}
            {data.length > 16 && index % 2 === 1 ? '' : datum.label}
          </span>
        ))}
      </div>

      {active !== null && data[active] ? (
        <div
          // Yalnız görsel konfor: veri sr-only tabloda tam olarak var. `role="status"`
          // olsaydı fare grafiğin üstünden geçerken her sütunda duyuru yapardı.
          aria-hidden
          className="rounded-control border-border bg-surface-raised text-ink pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 border px-3 py-1.5 text-xs shadow-[var(--shadow-overlay)]"
        >
          <span className="font-medium">{data[active].label}</span>
          <span className="tabular ml-2">{data[active].display}</span>
          {data[active].hint ? (
            <span className="text-ink-muted ml-2">{data[active].hint}</span>
          ) : null}
        </div>
      ) : null}

      {/*
        Ok tuşuyla gezerken seçili sütunun değeri okuyucuya bildirilir. Yalnız
        klavye gezinmesinde dolar; fare hareketinde `active` değişse de bu bölge
        aynı metni tekrar üretmez çünkü içerik sütuna bağlı, gezinmeye değil.
      */}
      <p className="sr-only" role="status">
        {active !== null && data[active] ? `${data[active].label}: ${data[active].display}` : ''}
      </p>

      {/* Kimlik renk-tek-başına taşınmaz: aynı veri tablo olarak da mevcut. */}
      <table id={tableId} className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Etiket</th>
            <th scope="col">{valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((datum) => (
            <tr key={datum.label}>
              <th scope="row">{datum.label}</th>
              <td>{datum.display}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
