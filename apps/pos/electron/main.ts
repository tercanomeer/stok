import { app, BrowserWindow } from 'electron';

import { createAppContext, type AppContext } from './app-context';
import { trustWebContents } from './ipc/handler';
import { registerHandlers } from './ipc/register-handlers';
import { applyContentSecurityPolicy, createMainWindow, hardenWebContents } from './window';

/**
 * Electron main process.
 *
 * Sorumluluğu dar: uygulama yaşam döngüsü, tek pencere, IPC kaydı. İş mantığı
 * `services/` altında ve electron'a bağlı değil — böylece test edilebilir kalır.
 *
 * Sertleştirme (`contextIsolation` / `nodeIntegration` / `sandbox`) `window.ts`
 * içinde ve buradan gevşetilmez (CLAUDE.md değişmez kuralları).
 */
let context: AppContext | null = null;
let mainWindow: BrowserWindow | null = null;
let unregisterEvents: (() => void) | null = null;

// Kasada uygulamanın ikinci kopyası SQLite dosyasını aynı anda açar ve iki ayrı
// sync döngüsü çalıştırır. Tek örnek zorunlu; ikinci başlatma var olan pencereyi öne alır.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  // Uygulamada oluşan HER web içeriği kısıtlanır — sonradan eklenen bir pencere de dahil.
  app.on('web-contents-created', (_event, contents) => hardenWebContents(contents));

  void app.whenReady().then(() => {
    applyContentSecurityPolicy();
    context = createAppContext();
    mainWindow = createMainWindow();
    trustWebContents(mainWindow.webContents);
    unregisterEvents = registerHandlers(context, mainWindow);

    context.network.start();
    void context.network.check();
    // Kaydedilmiş oturum varsa kasiyer şifre girmeden devam eder; yoksa giriş ekranı.
    context.auth.restoreLast(context.config.get().lastEmail);
    context.updater.start();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0 && context) {
        mainWindow = createMainWindow();
        trustWebContents(mainWindow.webContents);
        unregisterEvents?.();
        unregisterEvents = registerHandlers(context, mainWindow);
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Kuyruk ve WAL diske düzgün insin diye kapanışta depo kapatılır.
app.on('before-quit', () => {
  unregisterEvents?.();
  context?.dispose();
  context = null;
});
