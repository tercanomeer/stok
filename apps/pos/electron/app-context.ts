import path from 'node:path';

import { app, net } from 'electron';

import { readSettings } from './db/cache-repo';
import { openDatabase, type PosDatabase } from './db/database';
import { CustomerDisplayService } from './hardware/customer-display';
import { createMockFiscal, nullFiscal, type FiscalAdapter } from './hardware/fiscal';
import { createMockPosDevice, nullPosDevice, type PosDeviceAdapter } from './hardware/pos-device';
import { PrinterService } from './hardware/printer-service';
import { ScaleService } from './hardware/scale-service';
import { openTransport } from './hardware/transports';
import { ApiClient } from './services/api-client';
import { AuthService } from './services/auth-service';
import { CatalogService } from './services/catalog-service';
import { ConfigStore } from './services/config-store';
import { ContactService } from './services/contact-service';
import { electronCipher } from './services/electron-cipher';
import { electronUpdateEngine } from './services/electron-update-engine';
import { NetworkMonitor } from './services/network-monitor';
import { SaleService } from './services/sale-service';
import { SessionTokenStore } from './services/secure-store';
import { ShiftService } from './services/shift-service';
import { SyncService } from './services/sync-service';
import { UpdaterService } from './services/updater';
import { createCustomerWindow } from './window';

export interface AppContext {
  appVersion: string;
  db: PosDatabase;
  config: ConfigStore;
  api: ApiClient;
  tokens: SessionTokenStore;
  auth: AuthService;
  network: NetworkMonitor;
  sync: SyncService;
  shift: ShiftService;
  catalog: CatalogService;
  sale: SaleService;
  contacts: ContactService;
  printer: PrinterService;
  scale: ScaleService;
  customerDisplay: CustomerDisplayService;
  /** Banka POS ve ÖKC sürücüleri ayardan seçilir; her okuyuşta güncel sürücü döner. */
  posDevice: () => PosDeviceAdapter;
  fiscal: () => FiscalAdapter;
  updater: UpdaterService;
  dispose(): void;
}

/**
 * Kurulum kökü — bağımlılıklar burada bir kez kurulur, servisler birbirini
 * doğrudan `new`'lemez. Testler aynı servisleri sahte bağımlılıklarla kurabilsin
 * diye electron'a dokunan tek yer burasıdır.
 */
export function createAppContext(): AppContext {
  const userData = app.getPath('userData');
  const config = new ConfigStore(path.join(userData, 'config.json'));
  const db = openDatabase(path.join(userData, 'stokk-pos.db'));
  const tokens = new SessionTokenStore(db, electronCipher);

  // AuthService isteği atmak için ApiClient'a, ApiClient da 401'de oturumu
  // düşürmek için AuthService'e ihtiyaç duyar. Döngü, geri çağrının kurulum
  // anında değil ÇAĞRI anında çözülmesiyle kırılır; `authRef` bunu görünür kılar.
  let authRef: AuthService | null = null;
  const api = new ApiClient({
    getBaseUrl: () => config.get().serverUrl,
    tokens,
    onUnauthenticated: () => authRef?.forceLogout(),
  });

  const auth = new AuthService({ db, api, tokens, config });
  authRef = auth;

  const network = new NetworkMonitor({
    isOnline: () => net.isOnline(),
    probe: async () => {
      try {
        await api.request<unknown>('/health', { auth: false });
        return true;
      } catch {
        return false;
      }
    },
  });

  const shift = new ShiftService(api, config, db, () => network.isOnline);
  const sync = new SyncService({ db, api, isOnline: () => network.isOnline });
  const catalog = new CatalogService(db);
  const sale = new SaleService({
    db,
    api,
    auth,
    shift,
    sync,
    config,
    isOnline: () => network.isOnline,
  });
  const contacts = new ContactService(api, () => network.isOnline);
  // --- donanım -------------------------------------------------------------
  // Sahte sürücüler durum tutuyor (yarım kalmış işlem sorgusu). Kurulum kökünün
  // İÇİNDE yaratılıyorlar: modül seviyesinde tutulsalardı iki ayrı bağlam (ör.
  // iki test) aynı işlem geçmişini paylaşırdı.
  const mockPosDevice = createMockPosDevice();
  const mockFiscal = createMockFiscal();

  const getDevices = (): ReturnType<typeof config.getDevices> => config.getDevices();
  const printer = new PrinterService({
    db,
    openTransport,
    getConfig: getDevices,
    // Fiş genişliği POLİTİKA: tenant ayarından gelir, makineden değil.
    getWidthMm: () => (readSettings(db)?.receiptWidthMm === 58 ? 58 : 80),
  });
  const scale = new ScaleService({ openTransport, getConfig: getDevices });
  const customerDisplay = new CustomerDisplayService({
    getConfig: getDevices,
    createWindow: createCustomerWindow,
  });

  // Sürücüler her çağrıda ayardan okunur: kasiyer ayarı değiştirdiğinde
  // uygulamayı yeniden başlatmak zorunda kalmasın.
  const posDevice = (): PosDeviceAdapter =>
    getDevices().posDevice.driver === 'mock' ? mockPosDevice : nullPosDevice;
  const fiscal = (): FiscalAdapter =>
    getDevices().fiscal.driver === 'mock' ? mockFiscal : nullFiscal;

  const updater = new UpdaterService(app.isPackaged, electronUpdateEngine);

  // Ağ geri geldiğinde 30 sn'lik turu BEKLEME: kuyruk hemen boşalsın.
  const stopNetworkWatch = network.onChange((status) => {
    if (status.state === 'online') void sync.runOnce();
  });

  // Oturum açıldığında tam çekişle başla (silinen ürünler önbellekten ancak
  // tam çekişte düşer); oturum kapandığında döngüyü durdur.
  const stopSessionWatch = auth.onChange((session) => {
    if (session) {
      void sync.runOnce({ full: true });
      sync.start();
    } else {
      sync.stop();
    }
  });

  return {
    appVersion: app.getVersion(),
    db,
    config,
    api,
    tokens,
    auth,
    network,
    sync,
    shift,
    catalog,
    sale,
    contacts,
    printer,
    scale,
    customerDisplay,
    posDevice,
    fiscal,
    updater,
    dispose: () => {
      stopNetworkWatch();
      stopSessionWatch();
      sync.stop();
      network.stop();
      customerDisplay.stop();
      db.close();
    },
  };
}
