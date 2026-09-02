import { randomBytes } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { hash as bcryptHash, compare as bcryptCompare } from 'bcrypt';
import { verifySync as verifyTotp } from 'otplib';

import {
  DEFAULT_CATEGORIES,
  DEFAULT_UNITS,
  SYSTEM_ROLES,
  SYSTEM_ROLE_PERMISSIONS,
} from '@stokk/types';

import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from './dto/auth.dto.js';
import { hashToken, TokenService, type TokenPair } from './token.service.js';
import {
  BusinessRuleError,
  ForbiddenError,
  UnauthenticatedError,
} from '../../common/errors/domain-error.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RedisService } from '../../redis/redis.service.js';

const BCRYPT_ROUNDS = 12;
// Gerçek 60 karakterlik bcrypt hash'i — kullanıcı yokken de compare maliyeti ödensin
// (zamanlama saldırısına karşı). Biçimsiz bir string bcrypt tarafından erken reddedilir.
const DUMMY_HASH = '$2b$12$mmGgVwxyFDSXUGifXMhCquQL1ff3J2DWTHu85U0NDEDdnvVWe57fS';
const LOGIN_WINDOW_SECONDS = 60;
const MAX_LOGIN_ATTEMPTS = 5;
const RESET_TOKEN_TTL_SECONDS = 3600;
const RESET_TOKEN_PREFIX = 'auth:reset:';

export interface AuthenticatedUser {
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  permissions: string[];
  roles: string[];
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly tokens: TokenService,
  ) {}

  /**
   * Kayıt: tek adımda tenant + ayarlar + 3 sistem rolü + ilk Patron kullanıcı.
   *
   * Tenant henüz var olmadığı için RLS bağlamı kurulamaz — bu tek akış `system`
   * istemcisini kullanır. Tamamı tek transaction: yarım kalmış tenant oluşmaz.
   */
  async register(input: RegisterInput): Promise<TokenPair & { user: AuthenticatedUser }> {
    const existing = await this.prisma.system.user.findUnique({
      where: { email: input.email.toLowerCase() },
      select: { id: true },
    });

    if (existing) {
      throw new BusinessRuleError('EMAIL_ALREADY_REGISTERED', 'Bu e-posta zaten kayıtlı.');
    }

    const passwordHash = await bcryptHash(input.password, BCRYPT_ROUNDS);

    const created = await this.prisma.system.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: input.businessName,
          status: 'TRIAL',
          trialEndsAt: new Date(Date.now() + 14 * 86_400_000),
          settings: { create: {} },
        },
      });

      const permissions = await tx.permission.findMany({ select: { id: true, code: true } });
      const permissionIdByCode = new Map(permissions.map((p) => [p.code, p.id]));

      let ownerRoleId = '';
      for (const roleName of Object.values(SYSTEM_ROLES)) {
        const role = await tx.role.create({
          data: { tenantId: tenant.id, name: roleName, isSystem: true },
        });
        if (roleName === SYSTEM_ROLES.OWNER) ownerRoleId = role.id;

        const codes = SYSTEM_ROLE_PERMISSIONS[roleName];
        await tx.rolePermission.createMany({
          data: codes
            .map((code) => permissionIdByCode.get(code))
            .filter((id): id is string => id !== undefined)
            .map((permissionId) => ({ roleId: role.id, permissionId })),
          skipDuplicates: true,
        });
      }

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: input.email.toLowerCase(),
          passwordHash,
          fullName: input.fullName,
          phone: input.phone ?? null,
          roles: { create: { roleId: ownerRoleId } },
        },
      });

      // Varsayılan kasa — satış açık bir vardiyaya bağlı, vardiya da bir kasaya.
      await tx.register.create({ data: { tenantId: tenant.id, name: 'Kasa 1' } });

      // Varsayılan birimler — birim olmadan ürün oluşturulamaz.
      await tx.unit.createMany({
        data: DEFAULT_UNITS.map((unit) => ({ tenantId: tenant.id, ...unit })),
      });
      await tx.category.createMany({
        data: DEFAULT_CATEGORIES.map((name, index) => ({
          tenantId: tenant.id,
          name,
          sortOrder: index,
        })),
      });

      return { tenant, user };
    });

    this.logger.log(`Yeni tenant kaydı: ${created.tenant.id}`);
    const principal = await this.loadPrincipal(created.user.id);
    return this.issueTokens(principal);
  }

  async login(
    input: LoginInput,
    ipAddress: string,
  ): Promise<TokenPair & { user: AuthenticatedUser }> {
    const email = input.email.toLowerCase();
    const attemptKey = `${ipAddress}:${email}`;
    const attempts = await this.redis.countLoginAttempt(attemptKey, LOGIN_WINDOW_SECONDS);

    if (attempts > MAX_LOGIN_ATTEMPTS) {
      throw new BusinessRuleError(
        'TOO_MANY_ATTEMPTS',
        'Çok fazla başarısız giriş denemesi. Bir dakika sonra tekrar deneyin.',
      );
    }

    const user = await this.prisma.system.user.findUnique({
      where: { email },
      select: {
        id: true,
        passwordHash: true,
        status: true,
        totpSecret: true,
        tenant: { select: { status: true } },
      },
    });

    // Kullanıcı yoksa da bcrypt maliyetini öde: var/yok farkı zamanlamadan anlaşılmasın.
    const hash = user?.passwordHash ?? DUMMY_HASH;
    const passwordValid = await bcryptCompare(input.password, hash);

    if (!user || !passwordValid) {
      throw new UnauthenticatedError('E-posta veya şifre hatalı.');
    }
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenError('Hesabınız pasif durumda. İşletme yöneticinizle görüşün.');
    }
    if (user.tenant.status === 'SUSPENDED') {
      throw new ForbiddenError('İşletme aboneliği askıya alınmış.');
    }
    if (user.totpSecret) {
      if (!input.totpCode) {
        throw new BusinessRuleError('TOTP_REQUIRED', 'Doğrulama kodu gerekli.');
      }
      // Kod gerçekten doğrulanıyor — yalnız varlığına bakmak 2FA'yı dekoratif bırakırdı.
      if (!verifyTotp({ token: input.totpCode, secret: user.totpSecret }).valid) {
        throw new UnauthenticatedError('Doğrulama kodu hatalı.');
      }
    }

    await this.redis.clearLoginAttempts(attemptKey);
    await this.prisma.system.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const principal = await this.loadPrincipal(user.id);
    return this.issueTokens(principal);
  }

  /**
   * Refresh rotasyonu: kullanılan token geçersizleşir ve yerine yenisi verilir.
   * Aynı token ikinci kez kullanılamaz — hem DB'de `revokedAt` işaretlenir hem
   * Redis kara listesine girer (03-mimari.md "Kimlik & yetki").
   */
  async refresh(refreshToken: string): Promise<TokenPair & { user: AuthenticatedUser }> {
    const tokenHash = hashToken(refreshToken);

    if (await this.redis.isTokenRevoked(tokenHash)) {
      throw new UnauthenticatedError('Oturum süresi dolmuş, tekrar giriş yapın.');
    }

    const stored = await this.prisma.system.refreshToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, expiresAt: true, revokedAt: true },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthenticatedError('Oturum süresi dolmuş, tekrar giriş yapın.');
    }

    // Reuse tespiti: zaten iptal edilmiş bir token ikinci kez sunulduysa çalınmış
    // olabilir — o kullanıcının TÜM oturumları düşürülür (03-mimari refresh rotasyonu).
    if (stored.revokedAt) {
      this.logger.warn(`İptal edilmiş refresh token yeniden kullanıldı: user ${stored.userId}`);
      await this.revokeAllSessions(stored.userId);
      throw new UnauthenticatedError('Oturum süresi dolmuş, tekrar giriş yapın.');
    }

    // Rotasyonu ATOMİK yap: eski satır ancak hâlâ revokedAt=null iken işaretlenir.
    // count=0 ise başka bir eşzamanlı istek onu zaten döndürmüş demektir; ikinci
    // geçerli token zinciri üretmeyiz.
    const { count } = await this.prisma.system.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) {
      throw new UnauthenticatedError('Oturum süresi dolmuş, tekrar giriş yapın.');
    }

    const principal = await this.loadPrincipal(stored.userId);
    const next = await this.issueTokens(principal);

    await this.prisma.system.refreshToken.update({
      where: { id: stored.id },
      data: { replacedById: hashToken(next.refreshToken) },
    });
    await this.redis.revokeToken(
      tokenHash,
      Math.max(1, Math.floor((stored.expiresAt.getTime() - Date.now()) / 1000)),
    );

    return next;
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    const stored = await this.prisma.system.refreshToken.findUnique({
      where: { tokenHash },
      select: { id: true, expiresAt: true },
    });

    if (!stored) return;

    await this.prisma.system.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    await this.redis.revokeToken(
      tokenHash,
      Math.max(1, Math.floor((stored.expiresAt.getTime() - Date.now()) / 1000)),
    );
  }

  /**
   * Şifre sıfırlama token'ı Redis'te: tek kullanımlık ve süreli (1 saat).
   * Kullanıcının var olup olmadığı YANITTAN ANLAŞILMAZ — e-posta numaralandırmasını
   * önlemek için her durumda aynı sonuç döner.
   */
  async forgotPassword(input: ForgotPasswordInput): Promise<void> {
    const user = await this.prisma.system.user.findUnique({
      where: { email: input.email.toLowerCase() },
      select: { id: true, status: true },
    });

    if (!user || user.status !== 'ACTIVE') return;

    const token = randomBytes(32).toString('base64url');
    await this.redis.setEx(
      `${RESET_TOKEN_PREFIX}${hashToken(token)}`,
      user.id,
      RESET_TOKEN_TTL_SECONDS,
    );

    if (this.env.MAIL_PROVIDER === 'log') {
      this.logger.warn(`[dev] şifre sıfırlama token'ı (${input.email}): ${token}`);
    }
  }

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const key = `${RESET_TOKEN_PREFIX}${hashToken(input.token)}`;
    const userId = await this.redis.takeOnce(key);

    if (!userId) {
      throw new BusinessRuleError(
        'RESET_TOKEN_INVALID',
        'Sıfırlama bağlantısı geçersiz veya süresi dolmuş.',
      );
    }

    const passwordHash = await bcryptHash(input.password, BCRYPT_ROUNDS);
    await this.prisma.system.user.update({ where: { id: userId }, data: { passwordHash } });

    await this.revokeAllSessions(userId);
  }

  /**
   * Kullanıcının tüm aktif refresh token'larını iptal eder ve kara listeye alır.
   * Şifre değişince, kullanıcı pasifleştirilince veya silinince çağrılır — böylece
   * refresh rotasyonuyla erişim sürdürülemez.
   */
  async revokeAllSessions(userId: string): Promise<void> {
    const active = await this.prisma.system.refreshToken.findMany({
      where: { userId, revokedAt: null },
      select: { tokenHash: true, expiresAt: true },
    });

    await this.prisma.system.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await Promise.all(
      active.map((token) =>
        this.redis.revokeToken(
          token.tokenHash,
          Math.max(1, Math.floor((token.expiresAt.getTime() - Date.now()) / 1000)),
        ),
      ),
    );
  }

  async loadPrincipal(userId: string): Promise<AuthenticatedUser> {
    const user = await this.prisma.system.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        tenantId: true,
        email: true,
        fullName: true,
        status: true,
        deletedAt: true,
        tenant: { select: { status: true } },
        roles: {
          select: {
            role: {
              select: {
                name: true,
                permissions: { select: { permission: { select: { code: true } } } },
              },
            },
          },
        },
      },
    });

    // Hesap durumu HER token üretiminde kontrol edilir — yalnız login'de değil.
    // Aksi halde pasif/silinmiş kullanıcı refresh rotasyonuyla erişimini süresiz sürdürürdü.
    if (!user || user.status !== 'ACTIVE' || user.deletedAt !== null) {
      throw new UnauthenticatedError('Hesap erişimi kapalı, tekrar giriş yapın.');
    }
    if (user.tenant.status === 'SUSPENDED') {
      throw new UnauthenticatedError('İşletme aboneliği askıya alınmış.');
    }

    const permissions = new Set<string>();
    const roles: string[] = [];
    for (const link of user.roles) {
      roles.push(link.role.name);
      for (const rp of link.role.permissions) permissions.add(rp.permission.code);
    }

    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      fullName: user.fullName,
      permissions: [...permissions],
      roles,
    };
  }

  private async issueTokens(
    user: AuthenticatedUser,
  ): Promise<TokenPair & { user: AuthenticatedUser }> {
    const accessToken = await this.tokens.signAccessToken({
      sub: user.id,
      tenantId: user.tenantId,
      permissions: user.permissions,
    });
    const { token: refreshToken, hash } = this.tokens.createRefreshToken();

    await this.prisma.system.refreshToken.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        tokenHash: hash,
        expiresAt: this.tokens.refreshExpiresAt(),
      },
    });

    return { accessToken, refreshToken, expiresIn: this.tokens.accessTtlSeconds(), user };
  }
}
