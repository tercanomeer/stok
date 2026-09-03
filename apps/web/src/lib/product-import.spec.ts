import { describe, expect, it } from 'vitest';

import {
  duplicateMappedColumns,
  EMPTY_MAPPING,
  errorsToCsv,
  guessMapping,
  isMappingComplete,
  mapRows,
  toCanonicalRows,
  type ColumnMapping,
  type SourceRow,
} from './product-import';

const UNITS = ['Adet', 'ad', 'Kilogram', 'kg'];

describe('guessMapping', () => {
  it('Türkçe başlıkları tanır', () => {
    const mapping = guessMapping([
      'Ürün Adı',
      'Stok Kodu',
      'Birim',
      'Satış Fiyatı',
      'KDV',
      'Barkod',
    ]);
    expect(mapping).toEqual({
      name: 0,
      code: 1,
      unit: 2,
      salePrice: 3,
      vatRate: 4,
      barcode: 5,
    });
  });

  it('sıra farklı olsa da doğru sütunu bulur', () => {
    const mapping = guessMapping(['Barkod', 'Fiyat', 'Ad', 'Birim', 'KDV']);
    expect(mapping.name).toBe(2);
    expect(mapping.salePrice).toBe(1);
    expect(mapping.barcode).toBe(0);
  });

  it('tanınmayan başlık eşlenmez', () => {
    expect(guessMapping(['Kolon1', 'Kolon2']).name).toBe(-1);
  });
});

describe('eşleme doğrulama', () => {
  it('zorunlu alan eksikse tamam değil', () => {
    expect(isMappingComplete(EMPTY_MAPPING)).toBe(false);
    expect(
      isMappingComplete({ ...EMPTY_MAPPING, name: 0, unit: 1, salePrice: 2, vatRate: 3 }),
    ).toBe(true);
  });

  it('aynı sütun iki alana verilemez', () => {
    expect(duplicateMappedColumns({ ...EMPTY_MAPPING, name: 0, unit: 0 })).toEqual([0]);
    expect(duplicateMappedColumns({ ...EMPTY_MAPPING, name: 0, unit: 1 })).toEqual([]);
  });
});

const mapping: ColumnMapping = { name: 0, code: 1, unit: 2, salePrice: 3, vatRate: 4, barcode: 5 };

function row(rowNumber: number, cells: string[]): SourceRow {
  return { row: rowNumber, cells };
}

describe('mapRows', () => {
  it('sağlam satırı hatasız geçirir ve virgüllü fiyatı noktaya çevirir', () => {
    const [result] = mapRows([row(2, ['Kola', 'K1', 'ad', '24,50', '20', '869'])], mapping, UNITS);
    expect(result?.errors).toEqual([]);
    expect(result?.salePrice).toBe('24.50');
  });

  it('hatayı KAYNAK satır numarasıyla bildirir', () => {
    const [result] = mapRows([row(7, ['Su', '', 'ad', 'abc', '20', ''])], mapping, UNITS);
    expect(result?.row).toBe(7);
    expect(result?.errors).toEqual([{ field: 'salePrice', message: 'Geçersiz satış fiyatı.' }]);
  });

  it('geçersiz KDV oranını yakalar', () => {
    const [result] = mapRows([row(2, ['Su', '', 'ad', '10', '120', ''])], mapping, UNITS);
    expect(result?.errors.map((e) => e.field)).toEqual(['vatRate']);
  });

  it('kataloğda olmayan birimi sebebiyle bildirir', () => {
    const [result] = mapRows([row(2, ['Su', '', 'düzine', '10', '20', ''])], mapping, UNITS);
    expect(result?.errors[0]).toEqual({ field: 'unit', message: 'Birim bulunamadı: düzine' });
  });

  it('dosya içinde tekrar eden barkodu ilk satır numarasıyla işaretler', () => {
    const rows = mapRows(
      [
        row(2, ['Kola', '', 'ad', '10', '20', '869']),
        row(5, ['Fanta', '', 'ad', '11', '20', '869']),
      ],
      mapping,
      UNITS,
    );
    expect(rows[0]?.errors).toEqual([]);
    expect(rows[1]?.errors[0]?.message).toBe('Barkod 2. satırda da var.');
  });

  it('boş ürün adını zorunlu alan hatası sayar', () => {
    const [result] = mapRows([row(3, ['', '', 'ad', '10', '20', ''])], mapping, UNITS);
    expect(result?.errors.map((e) => e.field)).toContain('name');
  });
});

describe('toCanonicalRows', () => {
  it('sütunları backend sırasına dizer ve satır numarasını korur', () => {
    const rows = mapRows([row(9, ['Kola', 'K1', 'ad', '24,50', '20', '869'])], mapping, UNITS);
    expect(toCanonicalRows(rows)).toEqual([
      { row: 9, cells: ['Kola', 'K1', 'ad', '24.50', '20', '869'] },
    ]);
  });

  it('hatalı satırı da gönderir (kısmi başarı, numaralar kaymasın)', () => {
    const rows = mapRows(
      [row(2, ['Kola', '', 'ad', 'abc', '20', '']), row(3, ['Su', '', 'ad', '5', '20', ''])],
      mapping,
      UNITS,
    );
    expect(toCanonicalRows(rows).map((r) => r.row)).toEqual([2, 3]);
  });
});

describe('errorsToCsv', () => {
  it('BOM ve noktalı virgül ile Excel uyumlu çıktı verir', () => {
    const csv = errorsToCsv([
      { row: 4, message: 'Geçersiz KDV oranı.', field: 'vatRate', name: 'Su' },
    ]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"4";"Su";"vatRate";"Geçersiz KDV oranı."');
  });

  it('tırnak içeren metni kaçırır', () => {
    expect(errorsToCsv([{ row: 1, message: 'a"b' }])).toContain('"a""b"');
  });
});
