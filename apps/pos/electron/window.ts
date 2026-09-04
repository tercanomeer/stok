import path from 'node:path';

import { app, BrowserWindow, session, shell, type WebContents } from 'electron';

/**
 * Vite dev sunucusunun adresi — YALNIZ paketlenmemiş derlemede okunur.
 *
 * `process.env` çalışma anında okunduğu için, kurulu uygulamada bu değişkeni
 * ayarlayan biri (kasa PC'sine erişimi olan biri; tehdit modelimizin tam kendisi)
 * pencereyi kendi adresine yükletebilir, CSP'yi geliştirme diline düşürebilir ve
 * preload her sayfada çalıştığı için TÜM IPC yüzeyine erişebilirdi. `app.isPackaged`
 * kapısı bunu kapatır: kurulu sürümde env değişkeni hiç dikkate alınmaz.
 */
const DEV_SERVER_URL = app.isPackaged ? undefined : process.env.VITE_DEV_SERVER_URL;

/**
 * Renderer'ın gidebileceği TEK adres. Kasa uygulaması bir tarayıcı değil: buradan
 * başka bir yere gitmesi (ya da yeni pencere açması) yalnızca bir saldırı ya da hata
 * sonucudur, ikisi de engellenir.
 */
function isAllowedTarget(url: string): boolean {
  if (DEV_SERVER_URL && url.startsWith(DEV_SERVER_URL)) return true;
  return url.startsWith('file://');
}

/**
 * İçerik güvenlik politikası.
 *
 * Üretimde ağa çıkan hiçbir yön yok: script/stil/görsel yalnız paketin kendisinden
 * gelir (`'self'`), `connect-src 'none'` ile renderer'ın fetch/WebSocket açması
 * tamamen kapatılır — ağa çıkan tek yer main process'tir (03-mimari.md).
 * Geliştirmede Vite'ın HMR'ı için eval ve ws gerekiyor; bu gevşetme yalnız
 * dev sunucusu adresi tanımlıyken uygulanır.
 */
function contentSecurityPolicy(): string {
  if (DEV_SERVER_URL) {
    return [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${DEV_SERVER_URL}`,
      `style-src 'self' 'unsafe-inline' ${DEV_SERVER_URL}`,
      "img-src 'self' data:",
      `connect-src ${DEV_SERVER_URL} ws://localhost:5173`,
      "font-src 'self' data:",
    ].join('; ');
  }
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

export function applyContentSecurityPolicy(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [contentSecurityPolicy()],
      },
    });
  });

  // Kasa uygulamasının kamera/mikrofon/konum gibi izinlere ihtiyacı yok;
  // hepsi tek yerden reddedilir (varsayılan "sor" değil, "hayır").
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });
  // Asenkron istekler yukarıda reddediliyor; `permissions.query` gibi SENKRON
  // kontroller ayrı handler'dan geçiyor, o da kapatılır.
  session.defaultSession.setPermissionCheckHandler(() => false);
}

/** Her web içeriğine gezinme ve pencere açma kısıtı uygular. */
export function hardenWebContents(contents: WebContents): void {
  contents.on('will-navigate', (event, url) => {
    if (!isAllowedTarget(url)) event.preventDefault();
  });
  contents.setWindowOpenHandler(({ url }) => {
    // Dış bağlantı uygulama penceresinde değil, kullanıcının tarayıcısında açılır.
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-attach-webview', (event) => event.preventDefault());
}

/** Kasa ve müşteri pencerelerinin ORTAK sertleştirmesi — ikisi de aynı kilit altında. */
const WEB_PREFERENCES = {
  preload: path.join(__dirname, 'preload.js'),
  // Sertleştirme — buradan GEVŞETİLMEZ (CLAUDE.md / 03-mimari.md).
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  webviewTag: false,
  spellcheck: false,
} as const;

/**
 * Müşteri ekranı penceresi.
 *
 * Aynı renderer paketini `#customer` adresiyle yükler: ayrı bir Vite girişi ve
 * ayrı bir bundle, aynı bileşenlerin iki kopyasını paketlemek demekti. Pencere
 * çerçevesizdir ve odak ALMAZ — kasiyer yazarken odağın karşı ekrana kaçması
 * satışı durdururdu.
 */
export function createCustomerWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1024,
    height: 600,
    show: true,
    frame: false,
    focusable: false,
    skipTaskbar: true,
    backgroundColor: '#0b0b0c',
    title: 'Stokk Müşteri Ekranı',
    webPreferences: WEB_PREFERENCES,
  });

  hardenWebContents(window.webContents);
  window.setMenuBarVisibility(false);

  if (DEV_SERVER_URL) void window.loadURL(`${DEV_SERVER_URL}#customer`);
  else void window.loadFile(path.join(__dirname, '../dist/index.html'), { hash: 'customer' });

  return window;
}

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#fbfbfa',
    title: 'Stokk POS',
    webPreferences: WEB_PREFERENCES,
  });

  window.once('ready-to-show', () => window.show());
  hardenWebContents(window.webContents);

  if (DEV_SERVER_URL) void window.loadURL(DEV_SERVER_URL);
  else void window.loadFile(path.join(__dirname, '../dist/index.html'));

  return window;
}
