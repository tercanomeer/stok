import { decode } from 'iconv-lite';
import { describe, expect, it } from 'vitest';

import { EscPosEncoder } from './encoder';

/** Bayt dizisini okunur onaltılık gösterime çevirir — hata mesajı anlaşılır olsun. */
function hex(buffer: Buffer): string {
  return buffer.toString('hex');
}

describe('EscPosEncoder', () => {
  it('init yazıcıyı sıfırlar ve Türkçe kod sayfasını seçer', () => {
    // CP857 → ESC t 13; yanlış tablo "ş" yerine "þ" bastırır.
    expect(hex(new EscPosEncoder('CP857').init().build())).toBe('1b401b740d');
    expect(hex(new EscPosEncoder('CP1254').init().build())).toBe('1b401b742f');
  });

  it('Türkçe harfleri CP857 tablosuna çevirir, ASCII’ye DÜŞÜRMEZ', () => {
    const turkish = 'şçğüöıİĞŞÇÜÖ';
    const bytes = new EscPosEncoder('CP857').text(turkish).build();

    // Her harf tek bayt: UTF-8'e düşseydi 2 bayt olurdu ve yazıcı çöp basardı.
    expect(bytes).toHaveLength(turkish.length);
    // Asıl kanıt: aynı tabloyla geri çözülünce harfler aynen geliyor. Bayt
    // değerlerini elle yazmak testi tabloyu değil kendi tahminimi doğrulardı.
    expect(decode(bytes, 'cp857')).toBe(turkish);
    // Sessizce "s ç g u o i" gibi ASCII'ye düşmediğini de görelim.
    expect(decode(bytes, 'cp857')).not.toBe('scguoiIGSCUO');
  });

  it('CP1254 aynı harfleri FARKLI baytlarla yazar', () => {
    const cp857 = new EscPosEncoder('CP857').text('ş').build();
    const cp1254 = new EscPosEncoder('CP1254').text('ş').build();

    expect(cp857).toHaveLength(1);
    expect(cp1254).toHaveLength(1);
    // Aynı harf, farklı tablo, farklı bayt — bu yüzden tablo ayardan gelir.
    expect(hex(cp857)).not.toBe(hex(cp1254));
  });

  it('tabloda olmayan karakter yazıcıyı bozmaz', () => {
    // ₺ hiçbir kod sayfasında yok; iconv onu "?" ile değiştirir, bayt akışı bozulmaz.
    const bytes = new EscPosEncoder('CP857').text('₺').build();
    expect(bytes).toHaveLength(1);
  });

  it('satır yazımı LF ekler', () => {
    expect(hex(new EscPosEncoder('CP857').line('AB').build())).toBe('41420a');
  });

  it('hizalama ve kalın komutları doğru', () => {
    expect(hex(new EscPosEncoder('CP857').align('center').build())).toBe('1b6101');
    expect(hex(new EscPosEncoder('CP857').align('right').build())).toBe('1b6102');
    expect(hex(new EscPosEncoder('CP857').bold(true).build())).toBe('1b4501');
    expect(hex(new EscPosEncoder('CP857').bold(false).build())).toBe('1b4500');
  });

  it('kesme öncesi kağıt besler — son satırlar bıçağın altında kalmasın', () => {
    const bytes = hex(new EscPosEncoder('CP857').cut().build());
    expect(bytes).toBe('1b6404' + '1d5600');
  });

  it('çekmece darbesi ESC p komutunu üretir', () => {
    expect(hex(new EscPosEncoder('CP857').openDrawer().build())).toBe('1b700019fa');
    expect(hex(new EscPosEncoder('CP857').openDrawer(1).build())).toBe('1b700119fa');
  });

  it('logo raster başlığını genişliğe göre kurar', () => {
    const bitmap = Buffer.alloc(2 * 3, 0xff); // 16 piksel genişlik, 3 satır
    const bytes = new EscPosEncoder('CP857').image(16, 3, bitmap).build();

    // GS v 0 m xL xH yL yH + veri
    expect(hex(bytes.subarray(0, 8))).toBe('1d76300002000300');
    expect(bytes.length).toBe(8 + bitmap.length);
  });

  it('8’in katı olmayan logo genişliği reddedilir', () => {
    expect(() => new EscPosEncoder('CP857').image(13, 1, Buffer.alloc(2))).toThrow(/8 pikselin/);
  });

  it('logo verisi boyutla uyuşmuyorsa reddedilir', () => {
    expect(() => new EscPosEncoder('CP857').image(16, 3, Buffer.alloc(4))).toThrow(/uyuşmuyor/);
  });
});
