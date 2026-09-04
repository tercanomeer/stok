import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ConfigStore,
  DEFAULT_CONFIG,
  MAX_OFFLINE_GRACE_DAYS,
  normalizeServerUrl,
} from './config-store';

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stokk-pos-config-'));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('normalizeServerUrl', () => {
  it('şema yazılmazsa https varsayar', () => {
    expect(normalizeServerUrl('api.stokk.com.tr')).toEqual({
      ok: true,
      url: 'https://api.stokk.com.tr',
    });
  });

  it('sondaki eğik çizgileri atar', () => {
    expect(normalizeServerUrl('https://api.stokk.com.tr///')).toEqual({
      ok: true,
      url: 'https://api.stokk.com.tr',
    });
  });

  it('yerel ağ adreslerinde http kabul eder', () => {
    expect(normalizeServerUrl('http://localhost:3001').ok).toBe(true);
    expect(normalizeServerUrl('http://192.168.1.40:3001').ok).toBe(true);
    expect(normalizeServerUrl('http://10.0.0.5').ok).toBe(true);
  });

  it('genel internette şifresiz http REDDEDİLİR', () => {
    const result = normalizeServerUrl('http://api.stokk.com.tr');
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.message).toContain('https');
  });

  it('boş ve bozuk adresi reddeder', () => {
    expect(normalizeServerUrl('   ').ok).toBe(false);
    expect(normalizeServerUrl('ftp://x.y').ok).toBe(false);
  });
});

describe('ConfigStore', () => {
  it('dosya yoksa varsayılanı verir', () => {
    const store = new ConfigStore(path.join(tempDir, 'yok.json'));
    expect(store.get()).toEqual(DEFAULT_CONFIG);
  });

  it('değişikliği diske yazar ve tekrar okur', () => {
    const file = path.join(tempDir, 'config.json');
    new ConfigStore(file).patch({ serverUrl: 'https://api.test', registerId: 'r1' });

    const reopened = new ConfigStore(file);
    expect(reopened.get().serverUrl).toBe('https://api.test');
    expect(reopened.get().registerId).toBe('r1');
  });

  it('bozuk dosya uygulamayı açılmaz hâle getirmez', () => {
    const file = path.join(tempDir, 'config.json');
    fs.writeFileSync(file, '{ bu json değil');
    expect(new ConfigStore(file).get()).toEqual(DEFAULT_CONFIG);
  });

  it('yalnız sahibinin okuyabileceği izinle yazar', () => {
    const file = path.join(tempDir, 'config.json');
    new ConfigStore(file).patch({ serverUrl: 'https://api.test' });
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });

  it('dosyaya elle yazılmış şifresiz adresi OKURKEN düşürür', () => {
    // Config dosyası kullanıcının yazabildiği bir dizinde durur; oradan gelen
    // adres, kurulum ekranından geçmiş gibi kabul edilemez.
    const file = path.join(tempDir, 'config.json');
    fs.writeFileSync(
      file,
      JSON.stringify({ ...DEFAULT_CONFIG, serverUrl: 'http://saldirgan.example' }),
    );
    expect(new ConfigStore(file).get().serverUrl).toBeNull();
  });

  it('şifresiz adresi patch üzerinden de kabul etmez', () => {
    const store = new ConfigStore(path.join(tempDir, 'config.json'));
    expect(store.patch({ serverUrl: 'http://saldirgan.example' }).serverUrl).toBeNull();
  });

  it('çevrimdışı süreyi kod düzeyindeki sınıra çeker', () => {
    const file = path.join(tempDir, 'config.json');
    fs.writeFileSync(file, JSON.stringify({ ...DEFAULT_CONFIG, offlineGraceDays: 9999 }));
    expect(new ConfigStore(file).get().offlineGraceDays).toBe(MAX_OFFLINE_GRACE_DAYS);

    const store = new ConfigStore(path.join(tempDir, 'other.json'));
    expect(store.patch({ offlineGraceDays: 0 }).offlineGraceDays).toBe(1);
    expect(store.patch({ offlineGraceDays: 9999 }).offlineGraceDays).toBe(MAX_OFFLINE_GRACE_DAYS);
  });
});
