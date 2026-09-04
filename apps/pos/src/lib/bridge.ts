import type { IpcResult, StokkBridge } from '@shared/ipc-contracts';

declare global {
  interface Window {
    /** preload'un açtığı köprü. Renderer'ın dış dünyaya tek erişimi budur. */
    stokk: StokkBridge;
  }
}

/** Köprü yoksa (preload yüklenmemiş) uygulama sessizce bozulmasın, açıkça patlasın. */
export function bridge(): StokkBridge {
  if (typeof window === 'undefined' || !window.stokk) {
    throw new Error('Uygulama köprüsü yüklenemedi.');
  }
  return window.stokk;
}

export class BridgeError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BridgeError';
  }
}

/** Zarfı açar; hata durumunda mesajı ekranda gösterilebilir bir hataya çevirir. */
export async function unwrap<T>(promise: Promise<IpcResult<T>>): Promise<T> {
  const result = await promise;
  if (result.ok) return result.data;
  throw new BridgeError(result.error.code, result.error.message);
}

export function errorMessage(error: unknown, fallback = 'Bir hata oluştu.'): string {
  if (error instanceof BridgeError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
