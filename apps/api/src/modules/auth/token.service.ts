import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';

export interface AccessTokenPayload {
  sub: string;
  tenantId: string;
  permissions: string[];
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class TokenService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Refresh token rastgele bir gizli dize; JWT değil.
   * Veritabanında ve kara listede yalnız SHA-256 özeti tutulur — DB sızarsa
   * token'ların kendisi ele geçmez.
   */
  createRefreshToken(): { token: string; hash: string } {
    const token = randomBytes(48).toString('base64url');
    return { token, hash: hashToken(token) };
  }

  async signAccessToken(payload: AccessTokenPayload): Promise<string> {
    // expiresIn saniye olarak veriliyor: jsonwebtoken'ın string biçimi
    // literal union tipinde, env'den gelen serbest string ona uymuyor.
    return this.jwt.signAsync(payload, {
      secret: this.env.JWT_SECRET,
      expiresIn: this.accessTtlSeconds(),
    });
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return this.jwt.verifyAsync<AccessTokenPayload>(token, { secret: this.env.JWT_SECRET });
  }

  refreshExpiresAt(): Date {
    return new Date(Date.now() + parseDuration(this.env.JWT_REFRESH_TTL));
  }

  accessTtlSeconds(): number {
    return Math.floor(parseDuration(this.env.JWT_ACCESS_TTL) / 1000);
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const DURATION_UNITS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

export function parseDuration(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) {
    throw new Error(`Geçersiz süre biçimi: ${value}`);
  }
  const amount = Number(match[1]);
  const unit = DURATION_UNITS[match[2] as string];
  if (unit === undefined) {
    throw new Error(`Geçersiz süre birimi: ${value}`);
  }
  return amount * unit;
}
