import { encode } from 'iconv-lite';

/**
 * Termal yazıcının Türkçe karakter tablosu.
 *
 * ESC/POS yazıcılar tek bir "unicode" bilmez; her biri numaralı KOD SAYFALARI
 * taşır ve baytları o tabloya göre yorumlar. Türkçe için iki yaygın seçenek var:
 *  - CP857  (ESC t 13) — DOS Türkçe; ucuz Çinli yazıcıların çoğunda bu var.
 *  - CP1254 (ESC t 47) — Windows Türkçe; daha yeni modellerde.
 * Yanlış tabloyla "ş" yerine "þ" basılır; bu yüzden tablo AYARDAN gelir, tahmin
 * edilmez.
 */
export type Codepage = 'CP857' | 'CP1254';

/** ESC/POS `ESC t n` komutundaki tablo numaraları. */
const CODEPAGE_SELECTOR: Record<Codepage, number> = {
  CP857: 13,
  CP1254: 47,
};

/** iconv-lite'ın tanıdığı adlar. */
const ICONV_NAME: Record<Codepage, string> = {
  CP857: 'cp857',
  CP1254: 'win1254',
};

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;
const DLE = 0x10;
const EOT = 0x04;

/**
 * `DLE EOT n` — gerçek zamanlı durum sorgusu.
 *
 * Kağıdın bitmesi ya da kapağın açılması yazma işlemini BAŞARISIZ YAPMAZ: baytlar
 * porta gider, "yazdım" sanılır ve kasiyer fişin çıkmadığını ancak kağıda bakınca
 * anlar. Tek dürüst yol cihaza sormaktır.
 *
 * n = 1 yazıcı durumu (kapak), n = 4 kağıt sensörü.
 */
export const STATUS_QUERY_PRINTER = Buffer.from([DLE, EOT, 1]);
export const STATUS_QUERY_PAPER = Buffer.from([DLE, EOT, 4]);

export interface PrinterStatus {
  /** Kağıt bitmiş (sensör "yok" diyor). */
  paperOut: boolean;
  /** Kapak açık — bu hâlde yazıcı basmaz. */
  coverOpen: boolean;
}

/**
 * `DLE EOT 1` ve `DLE EOT 4` yanıtlarını çözer.
 *
 * ESC/POS'ta bu yanıtlar tek bayttır ve bit 0/1 sabit (0/1) olduğu için ayırt
 * edilebilir. Bit anlamları epson standardından:
 *  - n=1, bit 5 (0x20): kapak açık
 *  - n=4, bit 5 ve 6 (0x60): kağıt bitti
 */
export function decodePrinterStatus(printerByte: number, paperByte: number): PrinterStatus {
  return {
    coverOpen: (printerByte & 0x20) !== 0,
    paperOut: (paperByte & 0x60) !== 0,
  };
}

export type Align = 'left' | 'center' | 'right';

/**
 * ESC/POS komut üreticisi.
 *
 * Bilinçli olarak kütüphane kullanılmadı: ihtiyacımız olan komut kümesi küçük
 * (hizalama, kalın, çift yükseklik, kesme, çekmece), ama kod sayfası davranışı
 * Türkçe için kritik ve hazır kütüphanelerin çoğu CP857'yi ya hiç bilmiyor ya da
 * sessizce ASCII'ye düşürüyor — "ş" yerine "s" basan bir fiş kabul edilemez.
 */
export class EscPosEncoder {
  private readonly parts: Buffer[] = [];

  constructor(private readonly codepage: Codepage) {}

  /** Yazıcıyı sıfırlar ve Türkçe kod sayfasını seçer. Her fişin ilk komutu. */
  init(): this {
    return this.raw([ESC, 0x40], [ESC, 0x74, CODEPAGE_SELECTOR[this.codepage]]);
  }

  align(value: Align): this {
    const n = value === 'left' ? 0 : value === 'center' ? 1 : 2;
    return this.raw([ESC, 0x61, n]);
  }

  bold(on: boolean): this {
    return this.raw([ESC, 0x45, on ? 1 : 0]);
  }

  /** Çift yükseklik/genişlik — fiş toplamı gibi tek bir satır için. */
  double(on: boolean): this {
    return this.raw([GS, 0x21, on ? 0x11 : 0x00]);
  }

  /** Metni seçili kod sayfasına çevirip yazar. Satır sonu EKLEMEZ. */
  text(value: string): this {
    this.parts.push(encode(value, ICONV_NAME[this.codepage]));
    return this;
  }

  line(value = ''): this {
    return this.text(value).raw([LF]);
  }

  feed(lines = 1): this {
    return this.raw([ESC, 0x64, Math.max(0, Math.min(255, lines))]);
  }

  /** Kağıdı keser. `partial` kağıdı tam koparmaz, bir köşesi bağlı kalır. */
  cut(partial = false): this {
    // Kesiciye kadar besleme yapılmazsa fişin son satırları bıçağın altında kalır.
    return this.feed(4).raw([GS, 0x56, partial ? 1 : 0]);
  }

  /**
   * Para çekmecesi darbesi.
   *
   * Çekmece yazıcıya bağlıdır (RJ11); yazıcı üzerinden bir akım darbesiyle açılır.
   * `pin` 0 = çoğu çekmecenin bağlandığı 2 numaralı pin, 1 = 5 numaralı pin.
   */
  openDrawer(pin: 0 | 1 = 0): this {
    return this.raw([ESC, 0x70, pin, 25, 250]);
  }

  /**
   * 1-bit siyah/beyaz görüntü (logo). `GS v 0` raster biçimi.
   *
   * @param width  piksel genişliği; 8'e tam bölünmeli
   * @param bitmap satır satır paketlenmiş baytlar (1 = siyah)
   */
  image(width: number, height: number, bitmap: Buffer): this {
    if (width % 8 !== 0) throw new Error('Logo genişliği 8 pikselin katı olmalı.');
    const widthBytes = width / 8;
    if (bitmap.length !== widthBytes * height) {
      throw new Error('Logo verisi genişlik/yükseklik ile uyuşmuyor.');
    }
    return this.raw([
      GS,
      0x76,
      0x30,
      0,
      widthBytes & 0xff,
      (widthBytes >> 8) & 0xff,
      height & 0xff,
      (height >> 8) & 0xff,
    ]).append(bitmap);
  }

  raw(...sequences: number[][]): this {
    for (const sequence of sequences) this.parts.push(Buffer.from(sequence));
    return this;
  }

  append(buffer: Buffer): this {
    this.parts.push(buffer);
    return this;
  }

  build(): Buffer {
    return Buffer.concat(this.parts);
  }
}
