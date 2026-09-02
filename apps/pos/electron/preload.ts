import { contextBridge } from 'electron';

/**
 * Preload — renderer'a açılan tek yüzey.
 * Yalnız beyaz listeli IPC kanalları buradan geçer; renderer doğrudan HTTP atmaz.
 * Kanallar (auth, sync, printer, scale, posDevice, cashDrawer, system) Faz 12'de eklenir.
 */
contextBridge.exposeInMainWorld('stokk', {
  version: process.versions.electron,
});
