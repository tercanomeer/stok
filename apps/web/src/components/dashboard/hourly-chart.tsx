'use client';

import { useState, type ReactElement } from 'react';

import { formatMoney } from '@stokk/ui';

import type { SalesSeriesPoint } from '../../lib/api-types';

const W = 720;
const H = 220;
const PAD = { top: 16, right: 12, bottom: 28, left: 12 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

interface Bucket {
  hour: number;
  total: number;
}

// Backend saatlik bucket toplamını Decimal'den string olarak verir; burada
// parseFloat YALNIZ grafik yüksekliği + gösterim içindir (para hesabı değil,
// sonuç geri hesaba girmez — CLAUDE.md). Yerel saate göre nadir çakışmada toplanır.
function toBuckets(series: SalesSeriesPoint[]): Bucket[] {
  const totals = Array.from({ length: 24 }, () => 0);
  for (const p of series) {
    const hour = new Date(p.date).getHours();
    totals[hour] = (totals[hour] ?? 0) + Number.parseFloat(p.total);
  }
  return totals.map((total, hour) => ({ hour, total }));
}

/**
 * Bugünün saatlik cirosu — tek seri büyüklük grafiği (bar). dataviz: tek seri →
 * lejant yok (başlık adlandırır), ince mark, tabana çakılı 4px yuvarlak uç,
 * recessive eksen. Hover ile saat/ciro; erişilebilir tablo sr-only.
 */
export function HourlyChart({ series }: { series: SalesSeriesPoint[] }): ReactElement {
  const [hover, setHover] = useState<number | null>(null);
  const buckets = toBuckets(series);
  const max = Math.max(...buckets.map((b) => b.total), 1);
  const bandW = PLOT_W / 24;
  const barW = Math.min(bandW - 4, 22);

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-56 w-full"
        role="img"
        aria-label="Bugünün saatlik cirosu"
        preserveAspectRatio="none"
      >
        {/* taban çizgisi */}
        <line
          x1={PAD.left}
          y1={PAD.top + PLOT_H}
          x2={W - PAD.right}
          y2={PAD.top + PLOT_H}
          stroke="var(--border)"
          strokeWidth={1}
        />
        {buckets.map((b) => {
          const h = max > 0 ? (b.total / max) * PLOT_H : 0;
          const x = PAD.left + b.hour * bandW + (bandW - barW) / 2;
          const y = PAD.top + PLOT_H - h;
          const active = hover === b.hour;
          return (
            <g key={b.hour}>
              {/* geniş hedef: hover'ı kolaylaştırır */}
              <rect
                x={PAD.left + b.hour * bandW}
                y={PAD.top}
                width={bandW}
                height={PLOT_H}
                fill="transparent"
                onMouseEnter={() => {
                  setHover(b.hour);
                }}
                onMouseLeave={() => {
                  setHover(null);
                }}
              />
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(h, b.total > 0 ? 2 : 0)}
                rx={4}
                fill="var(--brand)"
                opacity={active || hover === null ? 1 : 0.55}
                pointerEvents="none"
              />
              {b.hour % 3 === 0 ? (
                <text
                  x={PAD.left + b.hour * bandW + bandW / 2}
                  y={H - 8}
                  textAnchor="middle"
                  className="fill-[var(--ink-subtle)] text-[10px]"
                >
                  {b.hour}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>

      <figcaption className="text-ink-muted mt-1 h-5 text-center text-sm" aria-live="polite">
        {hover !== null ? (
          <span>
            <span className="tabular text-ink font-medium">
              {String(hover).padStart(2, '0')}:00
            </span>
            {' — '}
            <span className="tabular text-ink font-medium">
              {formatMoney(buckets[hover]?.total ?? 0)}
            </span>
          </span>
        ) : (
          <span>Saat çubuğunun üzerine gelin</span>
        )}
      </figcaption>

      {/* Erişilebilir alternatif: saat/ciro tablosu */}
      <table className="sr-only">
        <caption>Bugünün saatlik cirosu</caption>
        <thead>
          <tr>
            <th scope="col">Saat</th>
            <th scope="col">Ciro</th>
          </tr>
        </thead>
        <tbody>
          {buckets
            .filter((b) => b.total > 0)
            .map((b) => (
              <tr key={b.hour}>
                <td>{String(b.hour).padStart(2, '0')}:00</td>
                <td>{formatMoney(b.total)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </figure>
  );
}
