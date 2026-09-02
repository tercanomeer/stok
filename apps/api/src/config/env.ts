import { z } from 'zod';

/**
 * Ortam değişkeni şeması.
 * Eksik veya biçimsiz değişkenle uygulama açılmaz — 03-mimari.md.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.url(),
  API_URL: z.url(),
  API_PORT: z.coerce.number().int().positive().default(3001),

  // Virgülle ayrılmış whitelist; boş bırakılamaz.
  // Origin başlığı asla path veya sondaki slash taşımaz; enableCors tam string
  // karşılaştırması yapıyor. 'http://localhost:3000/' yazılırsa doğrulamayı geçer
  // ama o origin'den gelen her istek sessizce bloklanır — o yüzden burada reddediliyor.
  CORS_ORIGINS: z
    .string()
    .min(1)
    .transform((value) => value.split(',').map((origin) => origin.trim()))
    .pipe(
      z
        .array(
          z.url().refine((value) => {
            const parsed = URL.parse(value);
            return parsed !== null && parsed.origin === value;
          }, 'Origin yalnız scheme://host[:port] biçiminde olmalı (path ve sondaki / olmadan)'),
        )
        .min(1),
    ),

  /// Migration, seed ve Studio bağlantısı — tablo sahibi rol, RLS'i baypas eder.
  DATABASE_URL: z.string().min(1),
  /// Uygulamanın runtime bağlantısı — stokk_app rolü, RLS politikalarına tabidir.
  /// İkisinin aynı olması izolasyonu sessizce devre dışı bırakır, o yüzden reddediliyor.
  APP_DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.stringbool().default(true),

  SMS_PROVIDER: z.enum(['log', 'netgsm', 'iletimerkezi']).default('log'),
  MAIL_PROVIDER: z.enum(['log', 'smtp']).default('log'),
  MAIL_FROM: z.email().default('noreply@stokk.local'),
  SMTP_URL: z.string().optional(),

  EINVOICE_PROVIDER: z.enum(['mock']).default('mock'),
  OKC_PROVIDER: z.enum(['mock']).default('mock'),
  PAYMENT_PROVIDER: z.enum(['mock']).default('mock'),

  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

const envSchemaWithRules = envSchema
  .refine((env) => env.APP_DATABASE_URL !== env.DATABASE_URL, {
    path: ['APP_DATABASE_URL'],
    message:
      'APP_DATABASE_URL, DATABASE_URL ile aynı olamaz — uygulama tablo sahibi rolle bağlanırsa row-level security baypas edilir.',
  })
  // Production'da MAIL_PROVIDER=log şifre sıfırlama token'ını düz metin log'a yazar.
  .refine((env) => !(env.NODE_ENV === 'production' && env.MAIL_PROVIDER === 'log'), {
    path: ['MAIL_PROVIDER'],
    message: "Production'da MAIL_PROVIDER 'log' olamaz — sıfırlama token'ları log'a sızar.",
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchemaWithRules.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Ortam değişkenleri geçersiz:\n${issues}`);
  }

  return result.data;
}
