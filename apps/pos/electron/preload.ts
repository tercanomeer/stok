import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import type {
  EventChannel,
  InvokeChannel,
  IpcResult,
  StokkBridge,
  Unsubscribe,
} from './shared/ipc-contracts';

/**
 * Preload — renderer'a açılan TEK yüzey.
 *
 * **Bu dosya kendi kendine yeter olmak ZORUNDA.** `sandbox: true` ile preload,
 * yalnız `electron` ve Node'un yerleşik modüllerini `require` edebilen kısıtlı bir
 * bağlamda koşar; kendi dosyalarımızı çağırmak "module not found" ile preload'u
 * hiç yükletmez ve uygulama boş ekranla açılır. Bu yüzden yukarıdaki sözleşme
 * import'u **yalnız tip** (`import type`) olarak alınır — derlemede tamamen silinir.
 *
 * Kurallar:
 *  - `ipcRenderer` renderer'a HİÇ verilmez; yalnız aşağıdaki sabit metod kümesi açılır.
 *  - Kanal adı renderer'dan GELMEZ: her metod kendi kanalını sabit olarak taşır ve
 *    `InvokeChannel` tipi sayesinde derleyici olmayan bir kanalı geçirmez. Beyaz liste
 *    budur; main tarafında da her kanalın handler'ı olduğu açılışta doğrulanır
 *    (`assertChannelsRegistered`).
 *  - Renderer doğrudan HTTP atmaz: ağa çıkan her yol main process'tedir.
 */

async function invoke<T>(channel: InvokeChannel, payload?: unknown): Promise<IpcResult<T>> {
  return (await ipcRenderer.invoke(channel, payload)) as IpcResult<T>;
}

function subscribe<T>(channel: EventChannel, listener: (payload: T) => void): Unsubscribe {
  const handler = (_event: IpcRendererEvent, payload: T): void => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

const bridge: StokkBridge = {
  system: {
    appInfo: () => invoke('system:app-info'),
    getConfig: () => invoke('system:get-config'),
    setServerUrl: (url) => invoke('system:set-server-url', { url }),
    testServer: (url) => invoke('system:test-server', { url }),
    networkStatus: () => invoke('system:network-status'),
    updateStatus: () => invoke('system:update-status'),
    onNetworkChange: (listener) => subscribe('event:network-status', listener),
    onUpdateChange: (listener) => subscribe('event:update-status', listener),
  },
  auth: {
    login: (input) => invoke('auth:login', input),
    logout: () => invoke('auth:logout'),
    session: () => invoke('auth:session'),
    onSessionChange: (listener) => subscribe('event:session-changed', listener),
  },
  sync: {
    status: () => invoke('sync:status'),
    run: () => invoke('sync:run'),
    retryFailed: () => invoke('sync:retry-failed'),
    failedSales: () => invoke('sync:failed-sales'),
    onStatusChange: (listener) => subscribe('event:sync-status', listener),
  },
  shift: {
    registers: () => invoke('shift:registers'),
    selectRegister: (input) => invoke('shift:select-register', input),
    current: () => invoke('shift:current'),
    open: (input) => invoke('shift:open', input),
    close: (input) => invoke('shift:close', input),
  },
  catalog: {
    settings: () => invoke('catalog:settings'),
    search: (query) => invoke('catalog:search', { query }),
    scan: (barcode) => invoke('catalog:scan', { barcode }),
  },
  sale: {
    submit: (draft) => invoke('sale:submit', draft),
    park: (input) => invoke('sale:park', input),
    parked: () => invoke('sale:parked'),
    unpark: (id) => invoke('sale:unpark', { id }),
    discardParked: (id) => invoke('sale:discard-parked', { id }),
    recent: (search) => invoke('sale:recent', { query: search }),
    return: (input) => invoke('sale:return', input),
  },
  contacts: {
    search: (query) => invoke('contacts:search', { query }),
  },
  printer: {
    status: () => invoke('printer:status'),
    printReceipt: (saleId) => invoke('printer:print-receipt', { saleId }),
  },
  scale: {
    status: () => invoke('scale:status'),
    read: () => invoke('scale:read'),
  },
  posDevice: {
    status: () => invoke('posDevice:status'),
    pay: (amount) => invoke('posDevice:pay', { amount }),
  },
  cashDrawer: {
    status: () => invoke('cashDrawer:status'),
    open: () => invoke('cashDrawer:open'),
  },
};

contextBridge.exposeInMainWorld('stokk', bridge);
