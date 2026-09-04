import { nativeImage } from 'electron';

import { DeviceError } from '../device-error';

export interface RasterLogo {
  width: number;
  height: number;
  /** Satır satır paketlenmiş 1-bit veri; 1 = siyah nokta. */
  bitmap: Buffer;
}

/**
 * Logo dosyasını termal yazıcının anladığı 1-bit rastere çevirir.
 *
 * Görüntü çözme için Electron'un `nativeImage`'i kullanılıyor: PNG/JPEG desteği
 * zaten Chromium'un içinde, ek bir görüntü kütüphanesi paketlemeye gerek yok.
 *
 * Renk → siyah/beyaz dönüşümü basit eşikle yapılır (gri > %50 ise beyaz). Termal
 * yazıcıda gri tonu yoktur; dithering yapmak küçük bir dükkân logosunda kazanç
 * getirmez, kirli bir baskı üretir.
 */
export function loadLogo(filePath: string, maxWidth: number): RasterLogo {
  const image = nativeImage.createFromPath(filePath);
  if (image.isEmpty()) {
    throw new DeviceError(
      'DEVICE_PROTOCOL',
      `logo okunamadı: ${filePath}`,
      'Logo dosyası okunamadı. PNG ya da JPEG bir dosya seçin.',
    );
  }

  // Genişlik 8'in katına indirilir: ESC/POS raster verisi bayt hizalıdır.
  const original = image.getSize();
  const targetWidth = Math.max(8, Math.floor(Math.min(original.width, maxWidth) / 8) * 8);
  const scaled =
    targetWidth === original.width ? image : image.resize({ width: targetWidth, quality: 'good' });

  const size = scaled.getSize();
  const rgba = scaled.toBitmap(); // BGRA, satır satır
  const widthBytes = size.width / 8;
  const bitmap = Buffer.alloc(widthBytes * size.height, 0);

  for (let y = 0; y < size.height; y += 1) {
    for (let x = 0; x < size.width; x += 1) {
      const offset = (y * size.width + x) * 4;
      const blue = rgba[offset] ?? 255;
      const green = rgba[offset + 1] ?? 255;
      const red = rgba[offset + 2] ?? 255;
      const alpha = rgba[offset + 3] ?? 255;
      // Saydam pikseller kağıt rengidir (beyaz), siyah basılmaz.
      const luminance = alpha < 128 ? 255 : 0.299 * red + 0.587 * green + 0.114 * blue;
      if (luminance < 128) {
        const index = y * widthBytes + (x >> 3);
        bitmap[index] = (bitmap[index] ?? 0) | (0x80 >> (x & 7));
      }
    }
  }

  return { width: size.width, height: size.height, bitmap };
}
