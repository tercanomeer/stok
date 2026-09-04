/**
 * `window.stokk` köprüsünün e2e testleri için tip bildirimi.
 *
 * Bilerek `apps/pos` içindeki sözleşmeden import EDİLMEZ: e2e testi kasa
 * uygulamasına dışarıdan bakan bir tüketicidir, paket sınırını aşıp iç tiplere
 * bağlanması testin "kara kutu" niteliğini bozar. Yalnız testlerin dokunduğu
 * yüzey burada duruyor; köprü değişirse test derlemede kırılır.
 */
interface PosIpcSuccess<T> {
  ok: true;
  data: T;
}

interface PosIpcFailure {
  ok: false;
  error: { code: string; message: string };
}

type PosIpcResult<T> = PosIpcSuccess<T> | PosIpcFailure;

interface PosSyncStatus {
  phase: 'idle' | 'pulling' | 'pushing';
  pendingCount: number;
  failedCount: number;
  cachedProductCount: number;
  lastPullAt: string | null;
  lastError: string | null;
}

interface PosCatalogProduct {
  id: string;
  name: string;
  salePrice: string;
  vatRate: number;
  barcodes: string[];
}

interface PosBridge {
  system: {
    appInfo(): Promise<PosIpcResult<{ appVersion: string; platform: string }>>;
  };
  auth: {
    login(input: { email: string; password: string }): Promise<PosIpcResult<{ offline: boolean }>>;
  };
  sync: {
    status(): Promise<PosIpcResult<PosSyncStatus>>;
  };
  catalog: {
    search(query: string): Promise<PosIpcResult<PosCatalogProduct[]>>;
  };
  sale: {
    parked(): Promise<PosIpcResult<{ id: string; label: string }[]>>;
  };
  printer: {
    status(): Promise<PosIpcResult<{ connected: boolean; detail: string }>>;
    printReceipt(saleId: string): Promise<PosIpcResult<never>>;
  };
}

interface Window {
  stokk: PosBridge;
}
