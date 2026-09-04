/**
 * Renderer ile main process arasındaki TEK sözleşme.
 *
 * Bu dosya hem main (preload dahil) hem renderer tarafından okunur; renderer yalnız
 * TİPLERİNİ alır (`import type`), kanal adlarını değil — kanal adı preload'un iç
 * detayıdır, renderer `window.stokk.<alan>.<metod>()` çağırır.
 *
 * Beyaz liste burasıdır: `INVOKE_CHANNELS` / `EVENT_CHANNELS` içinde olmayan bir kanal
 * preload'dan geçmez, main tarafında da handler kaydedilmez.
 */

// --- kanal beyaz listesi -----------------------------------------------------

/**
 * Renderer → main (istek/yanıt). Gruplar plandaki IPC yüzeyidir:
 * auth, sync, printer, scale, posDevice, cashDrawer, system (+ shift: kasa/vardiya akışı).
 */
export const INVOKE_CHANNELS = [
  // system
  'system:app-info',
  'system:get-config',
  'system:set-server-url',
  'system:test-server',
  'system:network-status',
  'system:update-status',
  // auth
  'auth:login',
  'auth:logout',
  'auth:session',
  // sync
  'sync:status',
  'sync:run',
  'sync:retry-failed',
  'sync:failed-sales',
  // shift — kasa seçimi ve vardiya açılışı (ekran akışı Faz 12)
  'shift:registers',
  'shift:select-register',
  'shift:current',
  'shift:open',
  // donanım — gövdeleri Faz 14'te dolar
  'printer:status',
  'printer:print-receipt',
  'scale:status',
  'scale:read',
  'posDevice:status',
  'posDevice:pay',
  'cashDrawer:status',
  'cashDrawer:open',
] as const;

/** main → renderer (tek yönlü bildirim). */
export const EVENT_CHANNELS = [
  'event:network-status',
  'event:sync-status',
  'event:session-changed',
  'event:update-status',
] as const;

export type InvokeChannel = (typeof INVOKE_CHANNELS)[number];
export type EventChannel = (typeof EVENT_CHANNELS)[number];

// --- yanıt zarfı -------------------------------------------------------------

/** API sözleşmesinin aynısı (CLAUDE.md): IPC yanıtı da zarflıdır. */
export interface IpcSuccess<T> {
  ok: true;
  data: T;
}

export interface IpcFailure {
  ok: false;
  error: { code: string; message: string; details?: unknown };
}

export type IpcResult<T> = IpcSuccess<T> | IpcFailure;

// --- veri tipleri ------------------------------------------------------------

export interface AppInfo {
  appVersion: string;
  electronVersion: string;
  chromeVersion: string;
  /** `process.platform` değeri — renderer'da Node tipleri yok, düz string. */
  platform: string;
}

export interface PosConfig {
  /** Sunucu adresi; boşsa kurulum ekranı gösterilir. */
  serverUrl: string | null;
  /** Seçili kasa (register) kimliği. */
  registerId: string | null;
  registerName: string | null;
  /** Çevrimdışı girişin kaç gün geçerli olduğu. */
  offlineGraceDays: number;
  /** Son giriş yapan kullanıcının e-postası — giriş ekranı önden doldurur. */
  lastEmail: string | null;
}

export type NetworkState = 'online' | 'offline' | 'unreachable';

export interface NetworkStatus {
  /** `online`: sunucu /health'e yanıt veriyor. `unreachable`: internet var, sunucu yok. */
  state: NetworkState;
  lastOkAt: string | null;
  lastCheckedAt: string;
}

export interface PosPrincipal {
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  permissions: string[];
  roles: string[];
}

export interface PosSession {
  user: PosPrincipal;
  /** true ise kimlik yerel önbellekten doğrulandı; sunucuya ulaşılamadı. */
  offline: boolean;
  /** Son BAŞARILI çevrimiçi girişin anı (ISO, UTC). */
  lastOnlineLoginAt: string;
}

export interface LoginInput {
  email: string;
  password: string;
  totpCode?: string;
}

export type SyncPhase = 'idle' | 'pulling' | 'pushing';

export interface SyncStatus {
  phase: SyncPhase;
  /** Katalog çekişinin son başarılı anı. */
  lastPullAt: string | null;
  lastPushAt: string | null;
  /** Gönderilmeyi bekleyen yerel satış sayısı. */
  pendingCount: number;
  /** 5 denemeden sonra pes edilen, elle müdahale bekleyen kayıt sayısı. */
  failedCount: number;
  cachedProductCount: number;
  lastError: string | null;
}

export interface FailedSale {
  entityId: string;
  attempts: number;
  lastError: string | null;
  updatedAt: string;
  soldAt: string | null;
  grandTotal: string | null;
}

export interface SyncRunResult {
  pulled: number;
  pushed: number;
  failed: number;
  skipped: boolean;
}

export interface Register {
  id: string;
  name: string;
  isActive: boolean;
}

export interface CashSession {
  id: string;
  registerId: string;
  status: 'OPEN' | 'CLOSED';
  /** Vardiya açılışında kasadaki nakit (sunucu sözleşmesiyle aynı ad). */
  openingAmount: string;
  openedAt: string;
}

export interface OpenShiftInput {
  registerId: string;
  openingAmount: string;
  note?: string;
}

export type UpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';

export interface UpdateStatus {
  phase: UpdatePhase;
  version: string | null;
  percent: number | null;
  message: string | null;
}

/** Donanım kanallarının Faz 14'e kadar döndüğü durum. */
export interface DeviceStatus {
  connected: boolean;
  /** Kullanıcıya gösterilecek Türkçe açıklama. */
  detail: string;
}

// --- preload yüzeyi ----------------------------------------------------------

/** Olay aboneliğini sonlandıran fonksiyon. */
export type Unsubscribe = () => void;

export interface StokkBridge {
  system: {
    appInfo(): Promise<IpcResult<AppInfo>>;
    getConfig(): Promise<IpcResult<PosConfig>>;
    setServerUrl(url: string): Promise<IpcResult<PosConfig>>;
    testServer(url: string): Promise<IpcResult<{ reachable: boolean; service: string | null }>>;
    networkStatus(): Promise<IpcResult<NetworkStatus>>;
    updateStatus(): Promise<IpcResult<UpdateStatus>>;
    onNetworkChange(listener: (status: NetworkStatus) => void): Unsubscribe;
    onUpdateChange(listener: (status: UpdateStatus) => void): Unsubscribe;
  };
  auth: {
    login(input: LoginInput): Promise<IpcResult<PosSession>>;
    logout(): Promise<IpcResult<null>>;
    session(): Promise<IpcResult<PosSession | null>>;
    onSessionChange(listener: (session: PosSession | null) => void): Unsubscribe;
  };
  sync: {
    status(): Promise<IpcResult<SyncStatus>>;
    run(): Promise<IpcResult<SyncRunResult>>;
    retryFailed(): Promise<IpcResult<{ requeued: number }>>;
    failedSales(): Promise<IpcResult<FailedSale[]>>;
    onStatusChange(listener: (status: SyncStatus) => void): Unsubscribe;
  };
  shift: {
    registers(): Promise<IpcResult<Register[]>>;
    /** Kasa seçimini MAKİNEYE yazar; güncel yapılandırmayı döner. */
    selectRegister(input: {
      registerId: string;
      registerName: string;
    }): Promise<IpcResult<PosConfig>>;
    current(): Promise<IpcResult<CashSession | null>>;
    open(input: OpenShiftInput): Promise<IpcResult<CashSession>>;
  };
  printer: {
    status(): Promise<IpcResult<DeviceStatus>>;
    printReceipt(saleId: string): Promise<IpcResult<never>>;
  };
  scale: {
    status(): Promise<IpcResult<DeviceStatus>>;
    read(): Promise<IpcResult<never>>;
  };
  posDevice: {
    status(): Promise<IpcResult<DeviceStatus>>;
    pay(amount: string): Promise<IpcResult<never>>;
  };
  cashDrawer: {
    status(): Promise<IpcResult<DeviceStatus>>;
    open(): Promise<IpcResult<never>>;
  };
}
