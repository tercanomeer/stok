/**
 * Güncelleme motorunun dar yüzeyi.
 *
 * `electron-updater` yalnız paketlenmiş bir Electron sürecinde anlamlı çalışır ve
 * modül düzeyinde tekil (`autoUpdater`) bir nesne verir. Servis doğrudan ona
 * bağlanırsa test edilemez; bu arayüz `electron-cipher.ts` ile aynı kalıbı izler:
 * elektron dokunan taraf ayrı dosyada, servis yalnız arayüzü görür.
 */
export interface UpdateEngineEvents {
  'update-available': (info: { version: string }) => void;
  'update-not-available': () => void;
  'download-progress': (progress: { percent: number }) => void;
  'update-downloaded': (info: { version: string }) => void;
  error: (error: Error) => void;
}

export interface UpdateEngine {
  /** Feed adresini yazar ve indirme davranışını ayarlar. */
  configure(feedUrl: string): void;
  checkForUpdates(): Promise<void>;
  on<K extends keyof UpdateEngineEvents>(event: K, listener: UpdateEngineEvents[K]): void;
}
