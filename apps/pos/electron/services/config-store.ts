import fs from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import type { PosConfig } from '../shared/ipc-contracts';

const configSchema = z
  .object({
    serverUrl: z.string().nullable().default(null),
    registerId: z.string().nullable().default(null),
    registerName: z.string().nullable().default(null),
    offlineGraceDays: z.coerce.number().default(7),
    lastEmail: z.string().nullable().default(null),
  })
  .strict();

/** Çevrimdışı oturumun kod düzeyindeki üst sınırı; config dosyası bunu aşamaz. */
export const MAX_OFFLINE_GRACE_DAYS = 90;

export const DEFAULT_CONFIG: PosConfig = {
  serverUrl: null,
  registerId: null,
  registerName: null,
  offlineGraceDays: 7,
  lastEmail: null,
};

/** Sunucu adresi doğrulaması sonucu. */
export type ServerUrlCheck = { ok: true; url: string } | { ok: false; message: string };

const PRIVATE_HOST =
  /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;

/**
 * Sunucu adresini normalize eder.
 *
 * Düz HTTP yalnız localhost ve özel ağ adreslerinde kabul edilir: kasa ile bulut
 * arasındaki trafik şifresiz geçerse aynı ağdaki biri token'ı okuyabilir. Dükkân
 * içi kurulum (yerel sunucu) bu kısıttan muaf.
 */
export function normalizeServerUrl(input: string): ServerUrlCheck {
  const trimmed = input.trim();
  if (trimmed.length === 0) return { ok: false, message: 'Sunucu adresi boş olamaz.' };

  // Şema yazılmışsa http/https OLMALI. Şemayı görmezden gelip başına `https://`
  // eklemek `ftp://x.y` gibi bir girdiyi `https://ftp//x.y` diye geçerli sayardı.
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(trimmed)?.[1];
  if (scheme !== undefined && !/^https?$/i.test(scheme)) {
    return { ok: false, message: 'Adres http veya https ile başlamalı.' };
  }

  let url: URL;
  try {
    url = new URL(scheme === undefined ? `https://${trimmed}` : trimmed);
  } catch {
    return { ok: false, message: 'Geçerli bir adres girin (örn. https://api.stokk.com.tr).' };
  }

  if (url.hostname.length === 0) {
    return { ok: false, message: 'Geçerli bir adres girin (örn. https://api.stokk.com.tr).' };
  }
  if (url.protocol === 'http:' && !PRIVATE_HOST.test(url.hostname)) {
    return {
      ok: false,
      message: 'Şifresiz http yalnız yerel ağ sunucuları için kullanılabilir; https girin.',
    };
  }

  const normalized = `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`;
  return { ok: true, url: normalized };
}

/**
 * Diskten okunan ya da IPC'den gelen ayarları güvenli aralığa çeker.
 *
 * Config dosyası kullanıcının yazabildiği bir dizinde durur: `serverUrl` sonradan
 * elle `http://saldirgan.example` yapılabilir, `offlineGraceDays` 9999'a çekilerek
 * çevrimdışı oturum süresiz uzatılabilirdi. Bu yüzden değerler yazılırken DE
 * okunurken DE aynı süzgeçten geçer.
 */
function sanitize(config: PosConfig): PosConfig {
  const server = config.serverUrl === null ? null : normalizeServerUrl(config.serverUrl);
  const grace = Number.isFinite(config.offlineGraceDays)
    ? Math.min(MAX_OFFLINE_GRACE_DAYS, Math.max(1, Math.trunc(config.offlineGraceDays)))
    : DEFAULT_CONFIG.offlineGraceDays;
  return {
    ...config,
    serverUrl: server !== null && server.ok ? server.url : null,
    offlineGraceDays: grace,
  };
}

/**
 * Kasa PC'sine özgü ayarlar — kullanıcı hesabına değil MAKİNEYE aittir
 * (hangi sunucu, hangi kasa). `app.getPath('userData')` altında düz JSON;
 * gizli bilgi TUTMAZ, token'lar şifreli olarak SQLite'ta durur.
 */
export class ConfigStore {
  private cache: PosConfig;

  constructor(private readonly file: string) {
    this.cache = this.load();
  }

  private load(): PosConfig {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = configSchema.safeParse(JSON.parse(raw));
      if (parsed.success) return sanitize(parsed.data);
      // Bozuk config uygulamayı açılmaz hâle getirmemeli: varsayılana dön,
      // kullanıcı kurulum ekranından yeniden ayarlasın.
      return { ...DEFAULT_CONFIG };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  get(): PosConfig {
    return { ...this.cache };
  }

  /**
   * Dosya kullanıcının yazabildiği bir dizinde durduğu için gelen değerler
   * BURADA da doğrulanır; `load()` ile aynı süzgeçten geçer.
   */
  patch(changes: Partial<PosConfig>): PosConfig {
    this.cache = sanitize({ ...this.cache, ...changes });
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, `${JSON.stringify(this.cache, null, 2)}\n`, { mode: 0o600 });
    return this.get();
  }
}
