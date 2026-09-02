import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';

const REVOKED_TOKEN_PREFIX = 'auth:revoked:';
const LOGIN_ATTEMPT_PREFIX = 'auth:attempts:';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(@Inject(ENV) env: Env) {
    this.client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: false });
    this.client.on('error', (error: Error) => {
      this.logger.error(`Redis bağlantı hatası: ${error.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  /**
   * Kullanılmış refresh token'ı kara listeye alır.
   *
   * Rotasyon: her refresh'te eski token geçersizleşir. Kara liste TTL'i token'ın
   * kalan ömrü kadar — süresi zaten dolmuş token'ı tutmanın anlamı yok.
   */
  async revokeToken(tokenHash: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) return;
    await this.client.set(`${REVOKED_TOKEN_PREFIX}${tokenHash}`, '1', 'EX', ttlSeconds);
  }

  async isTokenRevoked(tokenHash: string): Promise<boolean> {
    return (await this.client.exists(`${REVOKED_TOKEN_PREFIX}${tokenHash}`)) === 1;
  }

  /**
   * Başarısız giriş sayacı. Dönen değer o pencere içindeki deneme sayısıdır;
   * ilk denemede TTL kurulur, sonrakiler pencereyi uzatmaz (sabit pencere).
   */
  async countLoginAttempt(key: string, windowSeconds: number): Promise<number> {
    const redisKey = `${LOGIN_ATTEMPT_PREFIX}${key}`;
    const attempts = await this.client.incr(redisKey);
    if (attempts === 1) {
      await this.client.expire(redisKey, windowSeconds);
    }
    return attempts;
  }

  async clearLoginAttempts(key: string): Promise<void> {
    await this.client.del(`${LOGIN_ATTEMPT_PREFIX}${key}`);
  }

  /** Süreli tek değer — şifre sıfırlama token'ı gibi kısa ömürlü sırlar için. */
  async setEx(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  /**
   * Değeri okur ve aynı anda siler — tek kullanımlık token'lar için.
   * GETDEL atomiktir; oku-sonra-sil yarışında token iki kez kullanılabilirdi.
   */
  async takeOnce(key: string): Promise<string | null> {
    return this.client.getdel(key);
  }

  async ping(): Promise<boolean> {
    return (await this.client.ping()) === 'PONG';
  }
}
