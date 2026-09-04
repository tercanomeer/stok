import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { ZodError, type ZodType } from 'zod';

import { AppError } from '../lib/app-error';
import { ApiRequestError } from '../services/api-client';
import { INVOKE_CHANNELS, type InvokeChannel, type IpcResult } from '../shared/ipc-contracts';

/**
 * Yalnız bu WebContents'ten gelen çağrılar kabul edilir.
 *
 * `ipcMain.handle` uygulamadaki HER web içeriğini dinler. Bir gün bir iframe ya da
 * ikinci pencere eklenirse, kaydı olmayan bir içerik `auth:login` çağırabilirdi;
 * kapıyı baştan tek pencereye kilitliyoruz.
 */
let trustedContents: WebContents | null = null;

export function trustWebContents(contents: WebContents): void {
  trustedContents = contents;
}

function isTrusted(event: IpcMainInvokeEvent): boolean {
  return trustedContents !== null && event.sender.id === trustedContents.id;
}

/**
 * Hatayı renderer'a gösterilebilir hâle getirir.
 *
 * Bilinmeyen hatanın MESAJI renderer'a geçmez: yığın izi ya da dosya yolu kasiyerin
 * ekranına düşmemeli. Bilinen hata türleri (sunucu, kimlik, doğrulama) kendi Türkçe
 * mesajını taşır.
 */
function toFailure(error: unknown): IpcResult<never> {
  if (error instanceof ZodError) {
    return {
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'Girilen bilgiler geçersiz.' },
    };
  }
  if (error instanceof ApiRequestError || error instanceof AppError) {
    return { ok: false, error: { code: error.code, message: error.message } };
  }
  console.error('[ipc] beklenmeyen hata', error);
  return {
    ok: false,
    error: { code: 'UNEXPECTED', message: 'Beklenmeyen bir hata oluştu, tekrar deneyin.' },
  };
}

const registered = new Set<InvokeChannel>();

/**
 * Bir IPC kanalını kaydeder: gönderen doğrulaması → şema doğrulaması → iş →
 * zarflı yanıt. Handler'ın fırlattığı hata renderer'a asla ham geçmez.
 */
export function defineHandler<TInput, TOutput>(
  channel: InvokeChannel,
  schema: ZodType<TInput> | null,
  handler: (input: TInput) => TOutput | Promise<TOutput>,
): void {
  // Pencere yeniden yaratıldığında (macOS 'activate') aynı kanal ikinci kez
  // kaydedilir; önce eskisi kaldırılmazsa Electron hata fırlatır.
  ipcMain.removeHandler(channel);
  registered.add(channel);
  ipcMain.handle(channel, async (event, payload: unknown): Promise<IpcResult<TOutput>> => {
    if (!isTrusted(event)) {
      return { ok: false, error: { code: 'UNTRUSTED_SENDER', message: 'Yetkisiz istek.' } };
    }
    try {
      const input = schema ? schema.parse(payload) : (undefined as TInput);
      return { ok: true, data: await handler(input) };
    } catch (error) {
      return toFailure(error);
    }
  });
}

/**
 * Sözleşmedeki her kanalın gerçekten bir handler'ı olduğunu doğrular.
 *
 * Preload sandbox'ta kendi kendine yeter olmak zorunda olduğu için beyaz listeyi
 * çalışma anında OKUYAMIYOR (bkz. preload.ts). Kanal adlarını derleyici tutuyor,
 * ama "kanal var, karşılığı yok" boşluğunu ancak bu kontrol yakalar: eksik handler
 * kasada sessiz bir "kanal yanıt vermiyor" hatası yerine açılışta patlar.
 */
export function assertChannelsRegistered(): void {
  const missing = INVOKE_CHANNELS.filter((channel) => !registered.has(channel));
  if (missing.length > 0) {
    throw new Error(`IPC kanallarının handler'ı eksik: ${missing.join(', ')}`);
  }
}
