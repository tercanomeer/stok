import { describe, expect, it } from 'vitest';

import { parseScaleBarcode } from './scale-barcode';

describe('parseScaleBarcode', () => {
  const prefixes = ['27', '28'];

  it('fiyat gömülü barkodu ayrıştırır', () => {
    // 27 | 00042 | 01234 | 5 → ürün 00042, değer 01234 → fiyat 12.34
    const r = parseScaleBarcode('2700042012345', prefixes);
    expect(r).not.toBeNull();
    expect(r?.productCode).toBe('00042');
    expect(r?.rawValue).toBe('01234');
    expect(r?.embeddedPrice).toBe('12.34');
    expect(r?.embeddedWeightKg).toBe('1.234');
  });

  it('prefix eşleşmezse null', () => {
    expect(parseScaleBarcode('8690000000017', prefixes)).toBeNull();
  });

  it('13 hane değilse null', () => {
    expect(parseScaleBarcode('27000420123', prefixes)).toBeNull();
    expect(parseScaleBarcode('27abc42012345', prefixes)).toBeNull();
  });

  it('prefix listesi boşsa (tartı kapalı) null', () => {
    expect(parseScaleBarcode('2700042012345', [])).toBeNull();
  });

  it('ikinci prefix de eşleşir', () => {
    expect(parseScaleBarcode('2800042012345', prefixes)?.productCode).toBe('00042');
  });

  it('prefix ürün koduna yer bırakmayacak kadar uzunsa null', () => {
    expect(parseScaleBarcode('2712345012345', ['2712345'])).toBeNull();
  });

  it('gömülü değer sıfırsa fiyat/ağırlık "0.00"/"0.000" döner', () => {
    const r = parseScaleBarcode('2700042000005', prefixes);
    expect(r?.rawValue).toBe('00000');
    expect(r?.embeddedPrice).toBe('0.00');
    expect(r?.embeddedWeightKg).toBe('0.000');
  });

  it('kontrol hanesi doğrulanmaz — son hane hangi değer olursa olsun aynı şekilde ayrıştırılır', () => {
    // Fonksiyon EAN-13 checksum'ını hiç kontrol etmiyor (bkz. üretim notu); bu test mevcut
    // davranışı sabitliyor: geçersiz kontrol hanesi de sessizce kabul edilir.
    for (let digit = 0; digit <= 9; digit++) {
      const barcode = `270004201234${digit}`;
      const r = parseScaleBarcode(barcode, prefixes);
      expect(r?.productCode).toBe('00042');
      expect(r?.rawValue).toBe('01234');
      expect(r?.embeddedPrice).toBe('12.34');
    }
  });

  it('birden çok prefix çakışırsa dizideki İLK eşleşen kullanılır (en uzun değil)', () => {
    // '2' de '27' de barkodu karşılıyor; sıradaki ilk eleman ('2') kazanır → productCode/rawValue
    // '27' prefix'ine göre parse edilenden farklı çıkar. Tenant prefix sırası bu yüzden önemli.
    const shortFirst = parseScaleBarcode('2700042012345', ['2', '27']);
    expect(shortFirst?.productCode).toBe('700042');
    expect(shortFirst?.rawValue).toBe('01234');

    const longFirst = parseScaleBarcode('2700042012345', ['27', '2']);
    expect(longFirst?.productCode).toBe('00042');
  });

  it('sayısal olmayan prefix girdileri atlanır, geçerli olan kullanılır', () => {
    const r = parseScaleBarcode('2800042012345', ['XX', '28']);
    expect(r?.productCode).toBe('00042');
  });

  it('prefix, ürün koduna tam olarak 1 haneye yer bırakacak uzunlukta olabilir (sınır)', () => {
    // valueStart = 7 → prefix uzunluğu 6 iken productCode 1 haneye düşer (kabul edilir sınır).
    const r = parseScaleBarcode('2700042012345', ['270004']);
    expect(r?.productCode).toBe('2');
    expect(r?.rawValue).toBe('01234');
  });
});
