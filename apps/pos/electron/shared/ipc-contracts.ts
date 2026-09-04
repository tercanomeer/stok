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
  'shift:close',
  // catalog — satış ekranının ürün kaynağı; TAMAMI yerel önbellekten okunur
  'catalog:settings',
  'catalog:search',
  'catalog:scan',
  // sale — satış tamamlama, park ve iade (Faz 13)
  'sale:submit',
  'sale:park',
  'sale:parked',
  'sale:unpark',
  'sale:discard-parked',
  'sale:recent',
  'sale:return',
  // contacts — veresiye ve müşteri seçimi (sunucudan canlı arama)
  'contacts:search',
  // donanım (Faz 14)
  'printer:status',
  'printer:print-receipt',
  'printer:test',
  'printer:pending',
  'printer:retry-pending',
  'printer:discard-pending',
  'scale:status',
  'scale:read',
  'posDevice:status',
  'posDevice:pay',
  'posDevice:query',
  'posDevice:cancel',
  'cashDrawer:status',
  'cashDrawer:open',
  'fiscal:status',
  'fiscal:register',
  // cihaz ayarları — makineye ait, sunucuya gitmez
  'devices:get',
  'devices:set',
  'devices:serial-ports',
  'devices:displays',
  // müşteri ekranı
  'display:update',
] as const;

/** main → renderer (tek yönlü bildirim). */
export const EVENT_CHANNELS = [
  'event:network-status',
  'event:sync-status',
  'event:session-changed',
  'event:update-status',
  /** Müşteri ekranı penceresine giden sepet durumu. */
  'event:customer-display',
  /** Basılamamış fiş sayısı değişti. */
  'event:print-queue',
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

/**
 * POS'un çevrimdışıyken de bilmesi gereken tenant ayarları — `/sync/pull` ile gelir,
 * `settings_cache` içinde durur.
 */
export interface PosSettings {
  vatRates: number[];
  defaultVatRate: number;
  /** Terazi barkodu prefix'leri; boşsa tartılı barkod ayrıştırması kapalı. */
  scaleBarcodePrefixes: string[];
  currency: string;
  /** Bu oranın üzerindeki indirim `sale.discount.high` izni ister. */
  highDiscountThreshold: string;
  /** Stok yetersizken satışın engellenip engellenmediği. */
  negativeStockPolicy: 'ALLOW' | 'WARN' | 'BLOCK';
  receiptHeader: string | null;
  receiptFooter: string | null;
  /** Fiş kağıdı genişliği (mm) — 58 ya da 80. */
  receiptWidthMm: 58 | 80;
  /** Satış biter bitmez fiş otomatik bassın mı. */
  autoPrintReceipt: boolean;
}

/** Önbellekteki ürün — satış ekranı ürünü buradan alır, sunucuya sormaz. */
export interface CatalogProduct {
  id: string;
  name: string;
  /** Birim satış fiyatı — KDV DAHİL. */
  salePrice: string;
  vatRate: number;
  stockQuantity: string;
  trackStock: boolean;
  unitId: string;
  barcodes: string[];
}

/**
 * Okutulan barkodun çözümü.
 *
 * `quantity` yalnız tartılı barkodda dolu gelir (etiketteki ağırlık); normal barkodda
 * null'dır ve sepet 1 adet ekler.
 */
export interface ScanResult {
  product: CatalogProduct | null;
  /** Tartılı barkoddan okunan miktar (kg), yoksa null. */
  quantity: string | null;
  /** Barkod tartı deseniyle eşleşti mi — ürün bulunamasa da bilgi verir. */
  scale: boolean;
  barcode: string;
}

export interface OpenShiftInput {
  registerId: string;
  openingAmount: string;
  note?: string;
}

export interface CloseShiftInput {
  /** Kasiyerin saydığı nakit. */
  closingAmount: string;
  note?: string;
}

/** Vardiya kapanış özeti — kasiyere sayım farkını gösterir. */
export interface ShiftCloseResult {
  closingAmount: string;
  /** Sistemin beklediği nakit (açılış + nakit hareketleri). */
  expectedAmount: string;
  /** Sayılan − beklenen. Negatif = kasa eksik. */
  differenceAmount: string;
  /** Fark tenant eşiğini aşıyor mu — aşıyorsa yöneticiye rapor edilir. */
  overThreshold: boolean;
  closedAt: string;
}

// --- satış -------------------------------------------------------------------

/**
 * Sepetin bir satırı.
 *
 * İsteğe bağlı alanlar `| undefined` taşıyor: `exactOptionalPropertyTypes` altında
 * "alan yok" ile "alan var, değeri undefined" ayrı tiplerdir ve Zod'un ürettiği
 * çıktı ikincisidir. Sözleşme ikisini de kabul etmezse kanal doğrulamasının
 * sonucu doğrudan atanamıyor.
 */
export interface SaleLineDraft {
  productId: string;
  /** Fişte basılacak ad — ürün sonradan silinse bile yerel kayıt okunabilsin. */
  name: string;
  quantity: string;
  /** Birim satış fiyatı — KDV DAHİL. */
  unitPrice: string;
  vatRate: number;
  discountRate?: string | undefined;
  note?: string | undefined;
}

export interface SalePaymentDraft {
  method: 'CASH' | 'CARD' | 'CREDIT' | 'TRANSFER';
  amount: string;
  /** Nakitte müşterinin verdiği tutar; para üstü bundan hesaplanır. */
  receivedAmount?: string | undefined;
  reference?: string | undefined;
}

export interface SaleDraft {
  lines: SaleLineDraft[];
  payments: SalePaymentDraft[];
  contactId?: string | undefined;
  contactName?: string | undefined;
  documentDiscountRate?: string | undefined;
  note?: string | undefined;
}

/** Fişin tek satırı — ekranda önizlenir, Faz 14'te yazıcıya aynı yapı gider. */
export interface ReceiptLine {
  name: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  vatRate: number;
}

export interface ReceiptData {
  /** Sunucudan dönen gerçek fiş no; satış henüz gönderilmediyse null. */
  receiptNo: string | null;
  /** Yerel satış kimliği — sunucuya gidince aynı kayda bağlanır. */
  clientSaleId: string;
  soldAt: string;
  registerName: string | null;
  cashierName: string;
  contactName: string | null;
  lines: ReceiptLine[];
  subtotal: string;
  discountTotal: string;
  vatBreakdown: { vatRate: number; base: string; vatAmount: string }[];
  vatTotal: string;
  grandTotal: string;
  payments: { method: string; amount: string; receivedAmount: string | null }[];
  changeDue: string;
  header: string | null;
  footer: string | null;
  currency: string;
}

export interface CompletedSale {
  clientSaleId: string;
  grandTotal: string;
  changeDue: string;
  /** true ise satış sunucuya ULAŞTI; false ise kuyrukta bekliyor (çevrimdışı). */
  synced: boolean;
  receipt: ReceiptData;
}

/** Park edilmiş (bekletilen) satış — yerel, sunucuya gitmez. */
export interface ParkedSale {
  id: string;
  label: string;
  itemCount: number;
  grandTotal: string;
  parkedAt: string;
}

export interface ContactSummary {
  id: string;
  name: string;
  phone: string | null;
  /** Güncel bakiye (borç pozitif). */
  balance: string;
  creditLimit: string | null;
}

/** İade için aday satış — sunucudan gelir (iade çevrimiçi yapılır). */
export interface RecentSale {
  id: string;
  receiptNo: string | null;
  soldAt: string;
  grandTotal: string;
  status: string;
  items: {
    saleItemId: string;
    productName: string;
    quantity: string;
    returnedQuantity: string;
    lineTotal: string;
  }[];
}

export interface ReturnInput {
  saleId: string;
  refundMethod: 'CASH' | 'CARD' | 'CREDIT' | 'TRANSFER';
  reason: string;
  items: { saleItemId: string; quantity: string }[];
}

export interface ReturnResult {
  returnNo: string | null;
  totalAmount: string;
}

export type UpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';

export interface UpdateStatus {
  phase: UpdatePhase;
  version: string | null;
  percent: number | null;
  message: string | null;
}

/** Bir cihazın kasiyere gösterilen durumu. */
export interface DeviceStatus {
  connected: boolean;
  /** Kullanıcıya gösterilecek Türkçe açıklama. */
  detail: string;
}

// --- donanım (Faz 14) --------------------------------------------------------

export type TransportKind = 'serial' | 'network' | 'none';

/**
 * Bağlantı tanımı — AYRIK BİRLEŞİM.
 *
 * Tek bir "her alanı isteğe bağlı" nesne, `kind: 'serial'` ama `path` boş gibi
 * anlamsız durumları tip düzeyinde mümkün kılardı; main tarafındaki Zod şeması da
 * ayrık birleşim olduğu için ikisi birebir örtüşsün.
 */
export type DeviceTransport =
  /** COM3 / /dev/ttyUSB0. */
  | { kind: 'serial'; path: string; baudRate: number }
  /** Yazıcının IP'si ve RAW portu (genelde 9100). */
  | { kind: 'network'; host: string; port: number }
  | { kind: 'none' };

export type Codepage = 'CP857' | 'CP1254';
export type ScaleProtocolName = 'auto' | 'toledo' | 'cas' | 'generic';

/**
 * Kasa PC'sine bağlı cihazların ayarları — MAKİNEYE aittir, sunucuya gitmez
 * (hangi COM portu, hangi IP). Fiş genişliği ve otomatik basım gibi POLİTİKA
 * ayarları tenant tarafındadır ve `PosSettings` ile gelir.
 */
export interface DeviceSettings {
  printer: {
    transport: DeviceTransport;
    codepage: Codepage;
    openDrawerOnCashSale: boolean;
    /** Fişin üstüne basılacak logo dosyası (kasa PC'sinde); yoksa null. */
    logoPath: string | null;
  };
  scale: {
    transport: DeviceTransport;
    protocol: ScaleProtocolName;
  };
  customerDisplay: {
    enabled: boolean;
    displayId: number | null;
  };
  posDevice: { driver: 'none' | 'mock' };
  fiscal: { driver: 'none' | 'mock' };
}

export interface SerialPortOption {
  path: string;
  manufacturer: string | null;
  friendlyName: string | null;
}

export interface DisplayOption {
  id: number;
  label: string;
  primary: boolean;
}

/** Terazi okuması. */
export interface ScaleWeight {
  /** Kilogram, 3 ondalık. */
  weightKg: string;
  /** Tartı oturdu mu — oturmamış değer satışa girmez. */
  stable: boolean;
  protocol: Exclude<ScaleProtocolName, 'auto'>;
}

/** Basılamamış fiş. */
export interface PrintJob {
  id: string;
  clientSaleId: string;
  receiptNo: string | null;
  grandTotal: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
}

export interface PrintResult {
  printed: boolean;
  /** Basılamadı ve yeniden yazdırma kuyruğuna alındı. */
  queued: boolean;
  message: string | null;
}

export type PosDeviceStatusValue = 'approved' | 'declined' | 'cancelled' | 'unknown';

/** Banka POS cihazı işlem sonucu. */
export interface PosDeviceResult {
  /** Kasanın ürettiği işlem referansı; bağlantı koparsa akıbet bununla sorulur. */
  referenceId: string;
  status: PosDeviceStatusValue;
  amount: string | null;
  authCode: string | null;
  cardMask: string | null;
  message: string;
}

/** ÖKC (yeni nesil yazarkasa) sonucu — fiş üzerine basılır. */
export interface FiscalResult {
  fiscalNo: string;
  /** Karekod içeriği (GİB doğrulama adresi). */
  qrData: string;
  registeredAt: string;
}

/** Müşteri ekranında gösterilen durum. */
export interface CustomerDisplayState {
  lines: { name: string; quantity: string; lineTotal: string }[];
  grandTotal: string;
  /** Satış bittiğinde gösterilecek para üstü; yoksa null. */
  changeDue: string | null;
  /** Ekranın alt satırında duran karşılama metni. */
  message: string | null;
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
    /** Vardiyayı kapatır — sunucuya yazılır, çevrimdışı yapılamaz. */
    close(input: CloseShiftInput): Promise<IpcResult<ShiftCloseResult>>;
  };
  catalog: {
    settings(): Promise<IpcResult<PosSettings | null>>;
    /** Ada ya da barkoda göre yerel arama; boş sorgu ilk N ürünü verir. */
    search(query: string): Promise<IpcResult<CatalogProduct[]>>;
    /** Okutulan barkodu çözer (tartılı barkod dahil). */
    scan(barcode: string): Promise<IpcResult<ScanResult>>;
  };
  sale: {
    /** Satışı yerele yazar, kuyruğa alır ve ağ varsa hemen göndermeyi dener. */
    submit(draft: SaleDraft): Promise<IpcResult<CompletedSale>>;
    park(input: { label: string; draft: SaleDraft }): Promise<IpcResult<ParkedSale>>;
    parked(): Promise<IpcResult<ParkedSale[]>>;
    unpark(id: string): Promise<IpcResult<SaleDraft>>;
    discardParked(id: string): Promise<IpcResult<null>>;
    /** İade için son satışlar — sunucudan gelir, çevrimdışı çalışmaz. */
    recent(search: string): Promise<IpcResult<RecentSale[]>>;
    return(input: ReturnInput): Promise<IpcResult<ReturnResult>>;
  };
  contacts: {
    search(query: string): Promise<IpcResult<ContactSummary[]>>;
  };
  printer: {
    status(): Promise<IpcResult<DeviceStatus>>;
    /** Yerel satışın fişini basar; basılamazsa kuyruğa alır, HATA FIRLATMAZ. */
    printReceipt(input: { clientSaleId: string; copy?: boolean }): Promise<IpcResult<PrintResult>>;
    /** Ayarlardaki "Test fişi bas" — hata burada görünür olmalı. */
    test(): Promise<IpcResult<null>>;
    pending(): Promise<IpcResult<PrintJob[]>>;
    retryPending(): Promise<IpcResult<{ printed: number; remaining: number }>>;
    discardPending(id: string): Promise<IpcResult<null>>;
    onQueueChange(listener: (pending: number) => void): Unsubscribe;
  };
  scale: {
    status(): Promise<IpcResult<DeviceStatus>>;
    read(): Promise<IpcResult<ScaleWeight>>;
  };
  posDevice: {
    status(): Promise<IpcResult<DeviceStatus>>;
    pay(input: { amount: string; referenceId: string }): Promise<IpcResult<PosDeviceResult>>;
    query(referenceId: string): Promise<IpcResult<PosDeviceResult>>;
    cancel(referenceId: string): Promise<IpcResult<null>>;
  };
  cashDrawer: {
    status(): Promise<IpcResult<DeviceStatus>>;
    open(): Promise<IpcResult<null>>;
  };
  fiscal: {
    status(): Promise<IpcResult<DeviceStatus>>;
    register(clientSaleId: string): Promise<IpcResult<FiscalResult>>;
  };
  devices: {
    get(): Promise<IpcResult<DeviceSettings>>;
    set(settings: DeviceSettings): Promise<IpcResult<DeviceSettings>>;
    serialPorts(): Promise<IpcResult<SerialPortOption[]>>;
    displays(): Promise<IpcResult<DisplayOption[]>>;
  };
  display: {
    /** Sepet durumunu müşteri ekranına yayınlar. */
    update(state: CustomerDisplayState): Promise<IpcResult<null>>;
    /** Müşteri ekranı penceresi bu olayı dinler. */
    onChange(listener: (state: CustomerDisplayState) => void): Unsubscribe;
  };
}
