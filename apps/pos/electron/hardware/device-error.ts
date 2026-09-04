import { AppError } from '../lib/app-error';
import { log } from '../lib/logger';

/**
 * Donanım hatalarının ortak kodları.
 *
 * Kasiyer sürücü adı ya da `errno` görmemeli; her kod tek bir "şimdi ne yapmalıyım"
 * cümlesine karşılık gelir. Sürücüden gelen ham metin yalnız log'a yazılır.
 */
export type DeviceErrorCode =
  /** Cihaz yapılandırılmamış (ayarlar ekranından seçilmemiş). */
  | 'DEVICE_NOT_CONFIGURED'
  /** Yapılandırma var ama bağlanılamadı (kablo, kapalı cihaz, yanlış port/IP). */
  | 'DEVICE_UNREACHABLE'
  /** Cihaz bağlandı ama süresinde yanıt vermedi. */
  | 'DEVICE_TIMEOUT'
  /** Cihaz bağlı ama çalışamaz durumda (kağıt yok, kapak açık). */
  | 'DEVICE_NOT_READY'
  /** Cihazın yanıtı beklenen biçimde değil. */
  | 'DEVICE_PROTOCOL'
  /** Cihaz işlemi reddetti (ör. POS'ta iptal, ÖKC'de ret). */
  | 'DEVICE_REJECTED'
  /** Bu sürümde desteklenmeyen bağlantı/cihaz türü. */
  | 'DEVICE_UNSUPPORTED';

const MESSAGES: Record<DeviceErrorCode, string> = {
  DEVICE_NOT_CONFIGURED: 'Cihaz tanımlı değil. Ayarlar ekranından cihazı seçin.',
  DEVICE_UNREACHABLE: 'Cihaza ulaşılamıyor. Kabloyu ve cihazın açık olduğunu kontrol edin.',
  DEVICE_TIMEOUT: 'Cihaz yanıt vermedi. Kabloyu kontrol edip tekrar deneyin.',
  DEVICE_NOT_READY: 'Cihaz hazır değil. Kağıdı ve kapağı kontrol edin.',
  DEVICE_PROTOCOL: 'Cihazdan beklenmeyen bir yanıt geldi. Ayarlardaki cihaz türünü kontrol edin.',
  DEVICE_REJECTED: 'İşlem cihaz tarafından reddedildi.',
  DEVICE_UNSUPPORTED: 'Bu bağlantı türü bu sürümde desteklenmiyor.',
};

/**
 * Kullanıcıya gösterilebilir donanım hatası.
 *
 * `detail` yalnız LOG'a gider; renderer'a geçen mesaj her zaman yukarıdaki sabit
 * cümlelerden biridir (ya da çağıranın verdiği, kasiyer diliyle yazılmış metin).
 */
export class DeviceError extends AppError {
  constructor(
    code: DeviceErrorCode,
    /** Cihaz/sürücü kaynaklı ham açıklama — kasiyere GÖSTERİLMEZ. */
    readonly detail?: string,
    message?: string,
  ) {
    super(code, message ?? MESSAGES[code]);
    // Ham sürücü metni yalnız LOG'a; kasiyer ekranına asla.
    if (detail) log('error', 'hardware', code, { detail });
  }
}

/** Bilinmeyen bir hatayı kasiyere gösterilebilir bir donanım hatasına çevirir. */
export function toDeviceError(error: unknown, fallback: DeviceErrorCode): DeviceError {
  if (error instanceof DeviceError) return error;
  const detail = error instanceof Error ? error.message : String(error);
  // Sürücülerin `errno` metinleri: kasiyere değil, doğru koda çevirmeye yarar.
  // Windows'un COM port metinleri POSIX errno'larından farklı yazılır
  // ("File not found", "Unknown error code 121"); ikisi de aynı duruma işaret eder.
  if (/ENOENT|no such file|file not found|cannot open|ENXIO/i.test(detail)) {
    return new DeviceError('DEVICE_UNREACHABLE', detail);
  }
  if (/ECONNREFUSED|ECONNRESET|EPIPE|EHOSTUNREACH|ENETUNREACH|EHOSTDOWN/i.test(detail)) {
    return new DeviceError('DEVICE_UNREACHABLE', detail);
  }
  if (/unknown error code|device.*not (ready|functioning)|semaphore/i.test(detail)) {
    return new DeviceError('DEVICE_UNREACHABLE', detail);
  }
  // Sürücüler hem "timeout" hem "timed out" yazıyor; ikisi de aynı durum.
  if (/ETIMEDOUT|timed?\s*out/i.test(detail)) {
    return new DeviceError('DEVICE_TIMEOUT', detail);
  }
  if (/EACCES|EPERM|access denied/i.test(detail)) {
    return new DeviceError(
      'DEVICE_UNREACHABLE',
      detail,
      'Cihaza erişim izni yok. Portu kullanan başka bir program olabilir.',
    );
  }
  return new DeviceError(fallback, detail);
}
