import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Çevrimdışı giriş doğrulaması için YEREL parola özeti.
 *
 * Sunucudaki bcrypt hash'i POS'a hiç gelmez; POS son BAŞARILI çevrimiçi girişte
 * kullanıcının girdiği parolanın kendi özetini üretir ve yalnız onu saklar. Parolanın
 * kendisi hiçbir yerde durmaz.
 *
 * scrypt seçildi: Node'un standart kütüphanesinde var (kasa PC'sinde ek native modül
 * derlemesi gerekmez) ve bellek-sert olduğu için çalınan bir SQLite dosyasından
 * kaba kuvvetle parola çıkarmayı pahalılaştırır.
 */
const KEY_LENGTH = 64;
const SCRYPT_COST = 131_072; // N = 2^17
const SCRYPT_BLOCK_SIZE = 8; // r
const SCRYPT_PARALLELISM = 1; // p
const PREFIX = 'scrypt';

/**
 * Node'un varsayılan `maxmem` sınırı 32 MB; scrypt `128 * N * r` bayt ister ve
 * N = 2^17 için bu ~134 MB'tır. Sınır açıkça yükseltilmezse türetme hata verir.
 */
const MAX_MEMORY = 192 * 1024 * 1024;

/**
 * Özetin İÇİNDEN okunan N'in üst sınırı.
 *
 * Parametreler saklanan dizgede taşınır ki maliyet ileride yükseltilebilsin; ama
 * dosyaya elle N = 2^30 yazan biri her girişte gigabaytlarca bellek ayırtabilirdi.
 * Sınırın dışındaki özet doğrulanmaz, sessizce reddedilir.
 */
const MAX_STORED_COST = 1 << 20;
const MAX_STORED_BLOCK_SIZE = 16;
const MAX_STORED_PARALLELISM = 4;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password.normalize('NFKC'), salt, KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELISM,
    maxmem: MAX_MEMORY,
  });
  return [
    PREFIX,
    String(SCRYPT_COST),
    String(SCRYPT_BLOCK_SIZE),
    String(SCRYPT_PARALLELISM),
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

/** Sabit zamanlı karşılaştırma; biçimsiz özet sessizce false döner. */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== PREFIX) return false;

  const [, costText, blockText, parallelText, saltText, hashText] = parts;
  const cost = Number(costText);
  const blockSize = Number(blockText);
  const parallelism = Number(parallelText);
  if (!Number.isInteger(cost) || !Number.isInteger(blockSize) || !Number.isInteger(parallelism)) {
    return false;
  }
  if (cost < 2 || cost > MAX_STORED_COST || (cost & (cost - 1)) !== 0) return false;
  if (blockSize < 1 || blockSize > MAX_STORED_BLOCK_SIZE) return false;
  if (parallelism < 1 || parallelism > MAX_STORED_PARALLELISM) return false;

  const expected = Buffer.from(hashText ?? '', 'base64');
  if (expected.length === 0) return false;

  const derived = scryptSync(
    password.normalize('NFKC'),
    Buffer.from(saltText ?? '', 'base64'),
    expected.length,
    {
      N: cost,
      r: blockSize,
      p: parallelism,
      maxmem: MAX_MEMORY,
    },
  );
  return timingSafeEqual(derived, expected);
}
