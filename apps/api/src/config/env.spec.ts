import { describe, expect, it } from 'vitest';

import { loadEnv } from './env.js';

const validEnv = {
  NODE_ENV: 'test',
  APP_URL: 'http://localhost:3000',
  API_URL: 'http://localhost:3001',
  CORS_ORIGINS: 'http://localhost:3000,http://localhost:5173',
  DATABASE_URL: 'postgresql://stokk:stokk@localhost:5432/stokk',
  APP_DATABASE_URL: 'postgresql://stokk_app:cok-gizli-parola@localhost:5432/stokk',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'a'.repeat(48),
  JWT_REFRESH_SECRET: 'b'.repeat(48),
  S3_ENDPOINT: 'http://localhost:9000',
  S3_ACCESS_KEY: 'stokk',
  S3_SECRET: 'stokk12345',
  S3_BUCKET: 'stokk',
};

describe('loadEnv', () => {
  it('geçerli ortamı parse eder ve CORS listesini diziye çevirir', () => {
    const env = loadEnv(validEnv);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3000', 'http://localhost:5173']);
    expect(env.API_PORT).toBe(3001);
  });

  it('kısa JWT_SECRET ile açılmaz', () => {
    expect(() => loadEnv({ ...validEnv, JWT_SECRET: 'kisa' })).toThrow(/JWT_SECRET/);
  });

  it('sondaki slash taşıyan CORS origin ile açılmaz', () => {
    // Tarayıcının Origin başlığı asla sondaki slash taşımaz; kabul edilirse
    // o origin'den gelen her istek sessizce bloklanırdı.
    expect(() => loadEnv({ ...validEnv, CORS_ORIGINS: 'http://localhost:3000/' })).toThrow(
      /CORS_ORIGINS/,
    );
  });

  it('path içeren CORS origin ile açılmaz', () => {
    expect(() => loadEnv({ ...validEnv, CORS_ORIGINS: 'http://localhost:3000/api' })).toThrow(
      /CORS_ORIGINS/,
    );
  });

  it('APP_DATABASE_URL, DATABASE_URL ile aynıysa açılmaz', () => {
    // Uygulama tablo sahibi rolle bağlanırsa row-level security tamamen baypas edilir.
    expect(() => loadEnv({ ...validEnv, APP_DATABASE_URL: validEnv.DATABASE_URL })).toThrow(
      /APP_DATABASE_URL/,
    );
  });

  it('eksik DATABASE_URL ile açılmaz', () => {
    const { DATABASE_URL: _omitted, ...withoutDb } = validEnv;
    expect(() => loadEnv(withoutDb)).toThrow(/DATABASE_URL/);
  });
});
