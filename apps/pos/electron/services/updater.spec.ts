import { describe, expect, it } from 'vitest';

import type { UpdateEngine, UpdateEngineEvents } from './update-engine';
import { UpdaterService } from './updater';

/** Olayları elde tutan sahte motor — gerçek `electron-updater` yalnız pakette çalışır. */
class FakeEngine implements UpdateEngine {
  configuredWith: string | null = null;
  checks = 0;
  checkResult: Promise<void> = Promise.resolve();
  private handlers = new Map<string, (payload?: never) => void>();

  configure(feedUrl: string): void {
    this.configuredWith = feedUrl;
  }

  checkForUpdates(): Promise<void> {
    this.checks += 1;
    return this.checkResult;
  }

  on<K extends keyof UpdateEngineEvents>(event: K, listener: UpdateEngineEvents[K]): void {
    this.handlers.set(event, listener as (payload?: never) => void);
  }

  emit<K extends keyof UpdateEngineEvents>(
    event: K,
    ...args: Parameters<UpdateEngineEvents[K]>
  ): void {
    const handler = this.handlers.get(event);
    if (!handler) throw new Error(`Bağlanmamış olay: ${event}`);
    (handler as (...rest: unknown[]) => void)(...args);
  }
}

describe('UpdaterService', () => {
  it('paketlenmemiş derlemede motora HİÇ dokunmaz', () => {
    const engine = new FakeEngine();
    const updater = new UpdaterService(false, engine, 'https://update.test');

    updater.start();

    expect(engine.checks).toBe(0);
    expect(engine.configuredWith).toBeNull();
    expect(updater.status.phase).toBe('idle');
  });

  it('feed adresi yoksa boşta kalır', () => {
    const engine = new FakeEngine();
    const updater = new UpdaterService(true, engine, undefined);

    updater.start();

    expect(engine.checks).toBe(0);
    expect(updater.status.message).toContain('tanımlı değil');
  });

  it('kurulu sürümde feed adresini yazar ve kontrolü başlatır', () => {
    const engine = new FakeEngine();
    const updater = new UpdaterService(true, engine, 'https://update.test');

    updater.start();

    expect(engine.configuredWith).toBe('https://update.test');
    expect(engine.checks).toBe(1);
    expect(updater.status.phase).toBe('checking');
  });

  it('indirme akışını duruma çevirir ve dinleyicilere bildirir', () => {
    const engine = new FakeEngine();
    const updater = new UpdaterService(true, engine, 'https://update.test');
    const seen: string[] = [];
    updater.onChange((status) => seen.push(status.phase));

    updater.start();
    engine.emit('update-available', { version: '1.2.0' });
    engine.emit('download-progress', { percent: 41.6 });
    engine.emit('update-downloaded', { version: '1.2.0' });

    expect(seen).toEqual(['checking', 'available', 'downloading', 'ready']);
    expect(updater.status).toMatchObject({ phase: 'ready', version: '1.2.0', percent: 100 });
    // Kasiyer satışın ortasında kesilmesin: kurulum çıkışta.
    expect(updater.status.message).toContain('çıkınca');
  });

  it('kontrol reddedilirse hata durumuna düşer, çökmez', async () => {
    const engine = new FakeEngine();
    engine.checkResult = Promise.reject(new Error('sunucuya ulaşılamadı'));
    const updater = new UpdaterService(true, engine, 'https://update.test');

    updater.start();
    await Promise.resolve();

    expect(updater.status).toMatchObject({ phase: 'error', message: 'sunucuya ulaşılamadı' });
  });

  it('ikinci start olayları TEKRAR bağlamaz', () => {
    const engine = new FakeEngine();
    const updater = new UpdaterService(true, engine, 'https://update.test');
    const seen: string[] = [];

    updater.start();
    updater.onChange((status) => seen.push(status.phase));
    updater.start();
    engine.emit('update-not-available');

    expect(engine.checks).toBe(2);
    expect(seen).toEqual(['checking', 'idle']);
  });
});
