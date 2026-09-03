import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

/**
 * Tenant entegrasyon kimlik bilgilerinin (e-fatura parolası, SMS API anahtarı)
 * at-rest şifrelemesi. AES-256-GCM: gizlilik + bütünlük birlikte, bozulmuş kayıt
 * sessizce yanlış çözülmez, hata verir.
 *
 * Depolanan biçim: `v1:<iv-b64>:<tag-b64>:<ciphertext-b64>`. Sürüm öneki, ileride
 * anahtar/algoritma değişirse eski kayıtların ayırt edilebilmesi için.
 *
 * Anahtar `SETTINGS_ENCRYPTION_KEY`'den gelir; development'ta verilmemişse
 * JWT_SECRET'tan HKDF ile türetilir (env şeması production'da bunu reddeder).
 */
@Injectable()
export class SecretCipher {
  private readonly logger = new Logger(SecretCipher.name);
  private readonly key: Buffer;

  constructor(@Inject(ENV) env: Env) {
    if (env.SETTINGS_ENCRYPTION_KEY) {
      this.key = Buffer.from(env.SETTINGS_ENCRYPTION_KEY, 'hex');
    } else {
      this.key = Buffer.from(
        hkdfSync('sha256', env.JWT_SECRET, 'stokk-settings', 'settings-v1', KEY_BYTES),
      );
      this.logger.warn(
        'SETTINGS_ENCRYPTION_KEY tanımlı değil; anahtar JWT_SECRET’tan türetildi (yalnız development).',
      );
    }
  }

  encrypt(plainText: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  /** Çözülemeyen kayıt (anahtar değişmiş, veri bozulmuş) `null` döner — uygulama çökmez. */
  decrypt(stored: string): string | null {
    const parts = stored.split(':');
    if (parts.length !== 4 || parts[0] !== 'v1') return null;
    try {
      const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(parts[1] ?? '', 'base64'));
      decipher.setAuthTag(Buffer.from(parts[2] ?? '', 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(parts[3] ?? '', 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      this.logger.warn('Kayıtlı kimlik bilgisi çözülemedi — anahtar değişmiş olabilir.');
      return null;
    }
  }
}

/**
 * Kimlik bilgisini gösterime hazırlar: son 4 karakter dışında maskeler.
 * Kayıt yoksa `null` döner (ekranda "tanımlı değil" yazar).
 */
export function maskSecret(plainText: string | null): string | null {
  if (!plainText) return null;
  if (plainText.length <= 4) return '••••';
  return `••••${plainText.slice(-4)}`;
}
