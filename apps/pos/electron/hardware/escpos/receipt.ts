import { EscPosEncoder, type Codepage } from './encoder';
import type { RasterLogo } from './logo';
import type { ReceiptData } from '../../shared/ipc-contracts';

/** Kağıt genişliğine düşen karakter sayısı (Font A, 12×24). */
const COLUMNS: Record<58 | 80, number> = { 58: 32, 80: 48 };

export interface ReceiptOptions {
  codepage: Codepage;
  widthMm: 58 | 80;
  /** Kopya fiş üstüne "KOPYA" basılır — mükerrer fiş kasada karışıklık yaratmasın. */
  copy?: boolean;
  /** Fişin üstüne basılacak logo; yoksa atlanır. */
  logo?: RasterLogo | null;
}

/** Kağıda sığan azami logo genişliği (piksel). */
export const LOGO_MAX_WIDTH: Record<58 | 80, number> = { 58: 384, 80: 576 };

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Nakit',
  CARD: 'Kart',
  TRANSFER: 'Havale',
  CREDIT: 'Veresiye',
};

/**
 * `ReceiptData` → ESC/POS baytları.
 *
 * Fiş yapısı ekranda gösterilenle AYNI kaynaktan (`ReceiptData`) üretilir: kasiyerin
 * önizlemede gördüğü ile kağıttan çıkan arasında fark olmamalı. Burada yalnız
 * yerleşim (sütun genişliği, hizalama) var, hesap YOK.
 */
export function renderReceipt(receipt: ReceiptData, options: ReceiptOptions): Buffer {
  const width = COLUMNS[options.widthMm];
  const encoder = new EscPosEncoder(options.codepage).init();

  if (options.logo) {
    encoder.align('center').image(options.logo.width, options.logo.height, options.logo.bitmap);
    encoder.line();
  }

  if (options.copy) {
    encoder.align('center').bold(true).line('*** KOPYA ***').bold(false).line();
  }

  if (receipt.header) {
    encoder.align('center');
    for (const line of receipt.header.split('\n')) encoder.line(line.trim());
    encoder.line();
  }

  encoder.align('left');
  encoder.line(receipt.receiptNo ? `Fis No: ${receipt.receiptNo}` : 'Fis No: (gonderilmedi)');
  encoder.line(formatDateTime(receipt.soldAt));
  encoder.line(`Kasa: ${receipt.registerName ?? '-'}  Kasiyer: ${receipt.cashierName}`);
  if (receipt.contactName) encoder.line(`Musteri: ${receipt.contactName}`);
  encoder.line(divider(width));

  for (const line of receipt.lines) {
    // Ürün adı kendi satırında: 32 sütunlu kağıtta ad + miktar + tutar tek satıra
    // sığmıyor ve kırpılan ad fişi okunamaz kılıyor.
    encoder.line(truncate(line.name, width));
    encoder.line(
      columns(
        `  ${quantity(line.quantity)} x ${money(line.unitPrice)}`,
        money(line.lineTotal),
        width,
      ),
    );
  }

  encoder.line(divider(width));
  encoder.line(columns('Ara Toplam', money(receipt.subtotal), width));
  if (Number(receipt.discountTotal) > 0) {
    encoder.line(columns('Indirim', `-${money(receipt.discountTotal)}`, width));
  }
  for (const vat of receipt.vatBreakdown) {
    encoder.line(columns(`KDV %${String(vat.vatRate)}`, money(vat.vatAmount), width));
  }

  encoder.line(divider(width));
  encoder.bold(true).double(true);
  encoder.line(columns('TOPLAM', money(receipt.grandTotal), Math.floor(width / 2)));
  encoder.double(false).bold(false);

  for (const payment of receipt.payments) {
    encoder.line(
      columns(METHOD_LABEL[payment.method] ?? payment.method, money(payment.amount), width),
    );
  }
  if (Number(receipt.changeDue) > 0) {
    encoder.line(columns('Para Ustu', money(receipt.changeDue), width));
  }

  if (receipt.footer) {
    encoder.line().align('center');
    for (const line of receipt.footer.split('\n')) encoder.line(line.trim());
  }

  return encoder.cut().build();
}

/** Test fişi — kasiyerin "yazıcı çalışıyor mu" sorusunun cevabı. */
export function renderTestReceipt(options: ReceiptOptions): Buffer {
  const width = COLUMNS[options.widthMm];
  return (
    new EscPosEncoder(options.codepage)
      .init()
      .align('center')
      .bold(true)
      .line('STOKK TEST FISI')
      .bold(false)
      .line(divider(width))
      .align('left')
      .line(`Kod sayfasi: ${options.codepage}`)
      .line(`Kagit: ${String(options.widthMm)} mm / ${String(width)} sutun`)
      .line(divider(width))
      // Türkçe karakter denetimi: yanlış kod sayfasında bu satır bozuk basılır.
      .line('Turkce: sSiIgGuUoOcC')
      .line('ş Ş ı İ ğ Ğ ü Ü ö Ö ç Ç')
      .line(divider(width))
      .align('center')
      .line('Bu satirlar duzgun okunuyorsa')
      .line('yazici dogru ayarlanmis.')
      .cut()
      .build()
  );
}

/** Yalnız çekmece darbesi — fiş basmadan çekmeceyi açar. */
export function renderDrawerKick(codepage: Codepage): Buffer {
  return new EscPosEncoder(codepage).openDrawer().build();
}

function divider(width: number): string {
  return '-'.repeat(width);
}

/** Solda etiket, sağda tutar; arası boşlukla doldurulur. */
function columns(left: string, right: string, width: number): string {
  const gap = Math.max(1, width - left.length - right.length);
  return `${left}${' '.repeat(gap)}${right}`;
}

function truncate(value: string, width: number): string {
  return value.length <= width ? value : `${value.slice(0, width - 1)}.`;
}

/**
 * Fiş için sayı biçimleri.
 *
 * `@stokk/ui`'deki `formatMoney` BİLEREK kullanılmıyor: o paket renderer'a aittir
 * (main process'e React çeker ve installer'a girmez), üstelik "₺" sembolü üretir —
 * termal yazıcının kod sayfalarında ₺ karakteri YOKTUR, yerine "TL" yazılır.
 * Burada hesap değil yalnız gösterim var.
 */
const MONEY = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const QUANTITY = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 });

function money(value: string): string {
  return `${MONEY.format(Number(value))} TL`;
}

function quantity(value: string): string {
  return QUANTITY.format(Number(value));
}

/** Fiş tarihi: yazıcıda saat dilimi dönüşümü yapılmaz, gösterim biçimi sabittir. */
function formatDateTime(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${String(date.getFullYear())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}
