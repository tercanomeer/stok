import { ApiRequestError, type ApiClient } from './api-client';
import type { ConfigStore } from './config-store';
import type { SessionTokenStore } from './secure-store';
import type { PosDatabase } from '../db/database';
import { findSessionByEmail, findSessionById, saveSession } from '../db/session-repo';
import { AppError } from '../lib/app-error';
import { hashPassword, verifyPassword } from '../lib/password';
import type { LoginInput, PosPrincipal, PosSession } from '../shared/ipc-contracts';

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: PosPrincipal;
}

export interface AuthDeps {
  db: PosDatabase;
  api: ApiClient;
  tokens: SessionTokenStore;
  config: ConfigStore;
  clock?: () => Date;
}

export class AuthError extends AppError {}

/**
 * POS kimlik doğrulama — çevrimiçi asıl yol, çevrimdışı yedek yol.
 *
 * Çevrimdışı giriş yalnız DAHA ÖNCE bu makinede çevrimiçi giriş yapmış kullanıcı için
 * ve `offlineGraceDays` süresi içinde çalışır. Parola sunucuya sorulamadığı için yerel
 * scrypt özetiyle doğrulanır; süre sınırı olmadan bu, iptal edilmiş bir hesabın kasada
 * süresiz açık kalması demek olurdu.
 */
export class AuthService {
  private currentSession: PosSession | null = null;
  private listeners = new Set<(session: PosSession | null) => void>();

  constructor(private readonly deps: AuthDeps) {}

  private now(): Date {
    return (this.deps.clock ?? (() => new Date()))();
  }

  get session(): PosSession | null {
    return this.currentSession ? { ...this.currentSession } : null;
  }

  onChange(listener: (session: PosSession | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.session);
  }

  async login(input: LoginInput): Promise<PosSession> {
    const email = input.email.trim().toLowerCase();
    if (email.length === 0 || input.password.length === 0) {
      throw new AuthError('INVALID_CREDENTIALS', 'E-posta ve şifre gerekli.');
    }

    try {
      const response = await this.deps.api.request<LoginResponse>('/auth/login', {
        method: 'POST',
        auth: false,
        body: {
          email,
          password: input.password,
          ...(input.totpCode === undefined ? {} : { totpCode: input.totpCode }),
        },
      });
      return this.acceptOnlineLogin(response, input.password);
    } catch (error) {
      // Sunucu "hayır" dediyse (4xx) çevrimdışına DÜŞÜLMEZ: pasife alınmış bir hesap
      // ya da yanlış parola, ağ sorunu değildir. Yalnız ulaşılamama hâlinde yedek yol.
      if (error instanceof ApiRequestError && error.retriable) {
        return this.offlineLogin(email, input.password);
      }
      throw error;
    }
  }

  private acceptOnlineLogin(response: LoginResponse, password: string): PosSession {
    const now = this.now();
    const lastOnlineLoginAt = now.toISOString();
    const pair = { accessToken: response.accessToken, refreshToken: response.refreshToken };

    saveSession(
      this.deps.db,
      {
        user: response.user,
        passwordHash: hashPassword(password),
        tokenBlob: this.deps.tokens.seal(pair),
        lastOnlineLoginAt,
      },
      now,
    );
    this.deps.tokens.bind(response.user.id, pair);
    this.deps.config.patch({ lastEmail: response.user.email });

    this.currentSession = { user: response.user, offline: false, lastOnlineLoginAt };
    this.emit();
    return this.session as PosSession;
  }

  private offlineLogin(email: string, password: string): PosSession {
    const stored = findSessionByEmail(this.deps.db, email);
    if (!stored) {
      throw new AuthError(
        'OFFLINE_LOGIN_UNAVAILABLE',
        'Sunucuya ulaşılamıyor ve bu kullanıcı bu kasada daha önce giriş yapmamış.',
      );
    }
    if (!verifyPassword(password, stored.passwordHash)) {
      throw new AuthError('INVALID_CREDENTIALS', 'E-posta veya şifre hatalı.');
    }

    const graceDays = this.deps.config.get().offlineGraceDays;
    const deadline = new Date(stored.lastOnlineLoginAt).getTime() + graceDays * 86_400_000;
    if (this.now().getTime() > deadline) {
      throw new AuthError(
        'OFFLINE_GRACE_EXPIRED',
        `Çevrimdışı giriş süresi doldu (${String(graceDays)} gün). İnternet bağlantısıyla tekrar giriş yapın.`,
      );
    }

    this.deps.tokens.bind(stored.user.id, this.deps.tokens.open(stored.tokenBlob));
    this.deps.config.patch({ lastEmail: stored.user.email });

    this.currentSession = {
      user: stored.user,
      offline: true,
      lastOnlineLoginAt: stored.lastOnlineLoginAt,
    };
    this.emit();
    return this.session as PosSession;
  }

  /** Son giriş yapan kullanıcının oturumunu (varsa) geri yükler. */
  restoreLast(email: string | null): PosSession | null {
    if (!email) return null;
    const stored = findSessionByEmail(this.deps.db, email);
    return stored ? this.restore(stored.user.id) : null;
  }

  /**
   * Uygulama yeniden açıldığında oturumu önbellekten geri yükler — kasiyer her
   * açılışta şifre girmek zorunda kalmasın. Token yoksa (safeStorage kullanılamıyor,
   * kullanıcı çıkış yaptı) oturum geri YÜKLENMEZ.
   */
  restore(userId: string): PosSession | null {
    const stored = findSessionById(this.deps.db, userId);
    if (!stored) return null;

    const tokens = this.deps.tokens.open(stored.tokenBlob);
    if (!tokens) return null;

    const graceDays = this.deps.config.get().offlineGraceDays;
    const deadline = new Date(stored.lastOnlineLoginAt).getTime() + graceDays * 86_400_000;
    if (this.now().getTime() > deadline) return null;

    this.deps.tokens.bind(stored.user.id, tokens);
    this.currentSession = {
      user: stored.user,
      offline: false,
      lastOnlineLoginAt: stored.lastOnlineLoginAt,
    };
    this.emit();
    return this.session;
  }

  /**
   * Çıkış. Sunucudaki refresh token'ı da iptal etmeye çalışır ama başarısızlığı
   * yerel çıkışı ENGELLEMEZ — çevrimdışı kasada da çıkış yapılabilmeli.
   */
  async logout(): Promise<void> {
    const tokens = this.deps.tokens.read();
    if (tokens) {
      try {
        await this.deps.api.request<null>('/auth/logout', {
          method: 'POST',
          auth: false,
          body: { refreshToken: tokens.refreshToken },
        });
      } catch {
        // yut: yerel oturumu kapatmak her hâlükârda önceliklidir
      }
    }
    this.deps.tokens.clear();
    this.deps.tokens.unbind();
    this.currentSession = null;
    this.emit();
  }

  /** Sunucu refresh'i de reddettiğinde main process tarafından çağrılır. */
  forceLogout(): void {
    this.deps.tokens.unbind();
    this.currentSession = null;
    this.emit();
  }
}
