/**
 * Terazi ASCII protokolleri.
 *
 * Kasa terazileri standart tek bir protokol konuşmaz; ama sahadaki modellerin
 * büyük kısmı şu üç kalıptan birine giriyor:
 *
 *  - **Toledo (Mettler-Toledo, 8213/8217 ve klonları):** `STX <durum> <ağırlık> CR`
 *    ya da düz `ST,GS,   1.234kg` biçimi.
 *  - **CAS (CAS ER/AP ve klonları):** `S S    1.234 kg\r\n` — iki harfli durum,
 *    sağa yaslanmış sayı.
 *  - **Genel:** satırın içindeki İLK ondalıklı sayı. Model bilinmediğinde son çare.
 *
 * `parseWeight` hepsini dener ve ilk tutanı döner. Amaç, kasiyerin terazi modelini
 * ayarlardan seçmek zorunda kalmaması; seçerse (protocol !== 'auto') yalnız o
 * kalıp denenir ve yanlış eşleşme riski kalkar.
 */
export type ScaleProtocol = 'auto' | 'toledo' | 'cas' | 'generic';

export interface ScaleReading {
  /** Kilogram, en fazla 3 ondalık. */
  weightKg: string;
  /** Tartı oturmuş mu — oturmamış değer satışa girmez. */
  stable: boolean;
  /** Hangi kalıpla çözüldüğü; hata ayıklamada ve ayar ekranında gösterilir. */
  protocol: Exclude<ScaleProtocol, 'auto'>;
}

const STX = '\u0002';

/**
 * Toledo: `STX` ile başlar, durum baytları, sonra ağırlık.
 * Durumun ilk baytında bit 0 = hareket halinde (kararsız).
 */
function parseToledo(raw: string): ScaleReading | null {
  const index = raw.lastIndexOf(STX);
  if (index < 0) return null;
  const frame = raw.slice(index + 1);
  const match = /^([\s\S])[\s\S]{0,2}?\s*(-?\d+(?:\.\d+)?)/.exec(frame);
  if (!match) return null;
  const statusByte = match[1]?.charCodeAt(0) ?? 0;
  return {
    weightKg: normalize(match[2] ?? '0'),
    stable: (statusByte & 0x01) === 0,
    protocol: 'toledo',
  };
}

/** CAS: `ST` (stable) / `US` (unstable) ile başlayan satır, sonra sayı ve birim. */
function parseCas(raw: string): ScaleReading | null {
  const match = /\b(ST|US)\s*,?\s*(?:GS|NT)?\s*,?\s*(-?\d+(?:\.\d+)?)\s*(kg|g)?/i.exec(raw);
  if (!match) return null;
  const value = Number(match[2]);
  // Bazı modeller gram gönderiyor; birim yazmıyorsa kilogram varsayılır.
  const kg = match[3]?.toLowerCase() === 'g' ? value / 1000 : value;
  return {
    weightKg: normalize(String(kg)),
    stable: match[1]?.toUpperCase() === 'ST',
    protocol: 'cas',
  };
}

/**
 * Genel: satırdaki ilk ondalıklı sayı.
 *
 * Kararlılık bilgisi YOK; bu yüzden `stable: false` dönmez — bilinmeyeni "kararsız"
 * saymak, çalışan bir teraziyi kullanılamaz kılardı. Bilgi yokluğu kararlılık
 * varsayımına çevriliyor ve bu ayar ekranında yazıyor.
 */
function parseGeneric(raw: string): ScaleReading | null {
  const match = /(-?\d+\.\d+)/.exec(raw);
  if (!match) return null;
  return { weightKg: normalize(match[1] ?? '0'), stable: true, protocol: 'generic' };
}

const PARSERS: Record<Exclude<ScaleProtocol, 'auto'>, (raw: string) => ScaleReading | null> = {
  toledo: parseToledo,
  cas: parseCas,
  generic: parseGeneric,
};

/** Terazi çıktısını ayrıştırır; hiçbir kalıp tutmazsa null. */
export function parseWeight(raw: string, protocol: ScaleProtocol): ScaleReading | null {
  if (protocol !== 'auto') return PARSERS[protocol](raw);
  // Sıra önemli: `generic` neredeyse her şeye uyar, en sona kalmalı.
  return parseToledo(raw) ?? parseCas(raw) ?? parseGeneric(raw);
}

/**
 * Okuma tamamlandı mı — seri porttan veri parça parça gelir.
 *
 * Satır sonu görülmeden ayrıştırmak, "1.2" gelmişken 1,2 kg okumak demektir;
 * oysa terazi "1.234" gönderiyor olabilir.
 */
export function isCompleteReading(buffer: Buffer): boolean {
  return /[\r\n]/.test(buffer.toString('latin1'));
}

/**
 * Ağırlığı 3 ondalığa sabitler. NEGATİF DEĞER KORUNUR.
 *
 * Sıfıra yuvarlamak, darası alınmamış ya da ters basılmış bir terazide kasiyere
 * "0,000 kg, oturdu" göstermek demekti — gerçek arıza görünmez olurdu. Negatif
 * okumayı reddetmek `ScaleService`'in işi.
 */
function normalize(value: string): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0.000';
  return number.toFixed(3);
}
