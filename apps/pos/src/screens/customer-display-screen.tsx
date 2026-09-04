import type { CustomerDisplayState } from '@shared/ipc-contracts';
import { useEffect, useState, type ReactElement } from 'react';

import { formatMoney, formatQuantity } from '@stokk/ui';


import { bridge } from '../lib/bridge';

const EMPTY: CustomerDisplayState = {
  lines: [],
  grandTotal: '0.00',
  changeDue: null,
  message: 'Hoş geldiniz',
};

/**
 * Müşteri ekranı — kasanın karşısına dönük ikinci monitör.
 *
 * Bu pencere HİÇBİR ŞEY SORMAZ, yalnız dinler: kendi başına IPC çağrısı yapmaz,
 * sepeti main process'ten gelen olayla alır. Müşterinin gördüğü ekranın kasadan
 * bağımsız bir veri kaynağı olması, iki ekranın farklı tutar göstermesi demekti.
 *
 * Tasarım tek kurala göre: iki metre uzaktan okunmalı. Bu yüzden koyu zemin,
 * çok büyük punto ve yalnız son birkaç kalem.
 */
export function CustomerDisplayScreen(): ReactElement {
  const [state, setState] = useState<CustomerDisplayState>(EMPTY);

  useEffect(() => bridge().display.onChange(setState), []);

  // Müşteri kendi aldığı son kalemleri görsün; ekranı doldurmak okunurluğu bozar.
  const visible = state.lines.slice(-6);

  return (
    <div className="flex h-screen flex-col bg-[#0b0b0c] text-white">
      <ul className="flex flex-1 flex-col justify-end gap-2 overflow-hidden p-8">
        {visible.map((line, index) => (
          <li key={`${line.name}-${String(index)}`} className="flex items-baseline gap-6 text-3xl">
            <span className="min-w-0 flex-1 truncate text-white/90">{line.name}</span>
            <span className="text-white/60">{formatQuantity(line.quantity)}</span>
            <span className="w-56 text-right tabular-nums">{formatMoney(line.lineTotal)}</span>
          </li>
        ))}
      </ul>

      {state.changeDue === null ? (
        <div className="flex items-baseline justify-between border-t border-white/15 px-8 py-10">
          <span className="text-4xl text-white/60">TOPLAM</span>
          <span className="text-8xl font-bold tabular-nums">{formatMoney(state.grandTotal)}</span>
        </div>
      ) : (
        // Para üstü, toplamın yerini alır: satış bittiğinde müşterinin bakacağı
        // tek sayı odur.
        <div className="flex items-baseline justify-between border-t border-white/15 bg-emerald-950/60 px-8 py-10">
          <span className="text-4xl text-emerald-200/80">PARA ÜSTÜ</span>
          <span className="text-8xl font-bold text-emerald-300 tabular-nums">
            {formatMoney(state.changeDue)}
          </span>
        </div>
      )}

      {state.message ? (
        <p className="bg-white/5 px-8 py-4 text-center text-2xl text-white/70">{state.message}</p>
      ) : null}
    </div>
  );
}
