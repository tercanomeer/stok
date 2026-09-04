import type { TokenPair, TokenStore } from './api-client';
import type { PosDatabase } from '../db/database';
import { updateTokenBlob } from '../db/session-repo';

/**
 * safeStorage soyutlaması. Bu dosya electron'a BAĞLI DEĞİL — üretim uygulaması
 * `electron-cipher.ts` içindedir; testler sahte bir şifreleyici geçirir.
 * Üretimde işletim sisteminin anahtarlığı (Windows DPAPI / macOS Keychain) kullanılır.
 */
export interface SecretCipher {
  available: boolean;
  encrypt(plain: string): Buffer;
  decrypt(blob: Buffer): string;
}

/**
 * Token'ları safeStorage ile şifreleyip `sessions.token_blob` içinde tutan depo.
 *
 * Bellekte açık tutulan kopya isteğin Authorization başlığını yazmak için gerekli;
 * DİSKE düz metin token asla yazılmaz. safeStorage kullanılamıyorsa (ör. Linux'ta
 * anahtarlık yok) token diske HİÇ yazılmaz — uygulama çevrimiçi kalır ama yeniden
 * açılışta yeniden giriş ister. Sessizce düz metne düşmek, korumanın olmadığını
 * gizlemek olurdu.
 */
export class SessionTokenStore implements TokenStore {
  private memory: TokenPair | null = null;
  private userId: string | null = null;

  constructor(
    private readonly db: PosDatabase,
    private readonly cipher: SecretCipher,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Oturum açıldığında/geri yüklendiğinde hangi kullanıcının token'ları olduğunu bildirir. */
  bind(userId: string, tokens: TokenPair | null): void {
    this.userId = userId;
    this.memory = tokens;
  }

  unbind(): void {
    this.userId = null;
    this.memory = null;
  }

  read(): TokenPair | null {
    return this.memory;
  }

  write(tokens: TokenPair): void {
    this.memory = tokens;
    if (!this.userId) return;
    updateTokenBlob(this.db, this.userId, this.seal(tokens), this.clock());
  }

  clear(): void {
    this.memory = null;
    if (!this.userId) return;
    updateTokenBlob(this.db, this.userId, null, this.clock());
  }

  seal(tokens: TokenPair): Buffer | null {
    if (!this.cipher.available) return null;
    return this.cipher.encrypt(JSON.stringify(tokens));
  }

  /** Bozuk/eski blob oturumu düşürmemeli: çözülemezse token yokmuş gibi davranılır. */
  open(blob: Buffer | null): TokenPair | null {
    if (!blob || blob.length === 0 || !this.cipher.available) return null;
    try {
      const parsed: unknown = JSON.parse(this.cipher.decrypt(blob));
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        'accessToken' in parsed &&
        'refreshToken' in parsed &&
        typeof parsed.accessToken === 'string' &&
        typeof parsed.refreshToken === 'string'
      ) {
        return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken };
      }
      return null;
    } catch {
      return null;
    }
  }
}
