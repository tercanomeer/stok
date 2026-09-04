import { autoUpdater } from 'electron-updater';

import type { UpdateEngine, UpdateEngineEvents } from './update-engine';

/**
 * `electron-updater` adaptörü.
 *
 * İndirme otomatik, KURULUM çıkışta: kasiyeri satışın ortasında yeniden başlatan
 * bir güncelleyici kasada kabul edilemez.
 */
export const electronUpdateEngine: UpdateEngine = {
  configure(feedUrl: string): void {
    autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl });
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
  },
  async checkForUpdates(): Promise<void> {
    await autoUpdater.checkForUpdates();
  },
  on<K extends keyof UpdateEngineEvents>(event: K, listener: UpdateEngineEvents[K]): void {
    autoUpdater.on(event as 'error', listener as (error: Error) => void);
  },
};
