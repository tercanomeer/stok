import { z } from 'zod';

import type { ApiClient } from './api-client';
import type { ConfigStore } from './config-store';
import { readMeta, writeMeta, type PosDatabase } from '../db/database';
import { AppError } from '../lib/app-error';
import type {
  CashSession,
  CloseShiftInput,
  OpenShiftInput,
  PosConfig,
  Register,
  ShiftCloseResult,
} from '../shared/ipc-contracts';

/** Açık vardiya yerelde de tutulur; bkz. `active`. */
const ACTIVE_SHIFT_KEY = 'shift.active';

const registerSchema = z.object({
  id: z.string(),
  name: z.string(),
  isActive: z.boolean(),
});

const cashSessionSchema = z.object({
  id: z.string(),
  registerId: z.string(),
  status: z.enum(['OPEN', 'CLOSED']),
  openingAmount: z.coerce.string(),
  openedAt: z.string(),
});

const closeResultSchema = z.object({
  session: z.object({
    closingAmount: z.coerce.string(),
    expectedAmount: z.coerce.string(),
    differenceAmount: z.coerce.string(),
    closedAt: z.string(),
  }),
  overThreshold: z.boolean(),
});

/**
 * Kasa seçimi ve vardiya açılışı — açılış akışının sunucuya dokunan kısmı.
 *
 * Satış ekranı (Faz 13) açık bir vardiya olmadan çalışamaz; bu yüzden akış
 * "kasa seç → vardiyayı aç/devral" adımını atlayamaz. Seçilen kasa makineye
 * yazılır: aynı kasa PC'si her açılışta aynı kasa olarak gelir.
 */
export class ShiftService {
  constructor(
    private readonly api: ApiClient,
    private readonly config: ConfigStore,
    private readonly db: PosDatabase,
    /** Vardiya kapanışı sunucuya yazılır; ağ yoksa hiç denenmez. */
    private readonly isOnline: () => boolean = () => true,
  ) {}

  /**
   * Son bilinen açık vardiya — SATIŞ BUNA YAZILIR.
   *
   * `current()` sunucuya sorar; internet kesikken sorulamaz. Satış ise
   * `cashSessionId` olmadan kaydedilemez. Bu yüzden vardiya açıldığında ya da
   * sorgulandığında yerele yazılır ve çevrimdışı satış oradan okur. Kaynak yine
   * sunucudur: her başarılı sorgu bu kaydı tazeler, vardiya kapanınca siler.
   */
  get active(): CashSession | null {
    const raw = readMeta(this.db, ACTIVE_SHIFT_KEY);
    if (!raw) return null;
    const parsed = cashSessionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  }

  private remember(session: CashSession | null): void {
    writeMeta(this.db, ACTIVE_SHIFT_KEY, session ? JSON.stringify(session) : '');
  }

  async listRegisters(): Promise<Register[]> {
    const raw = await this.api.request<unknown>('/registers');
    return z.array(registerSchema).parse(raw);
  }

  /** Seçili kasadaki açık vardiya; yoksa null. Kasa seçilmemişse de null. */
  async current(): Promise<CashSession | null> {
    const registerId = this.config.get().registerId;
    if (!registerId) return null;
    const raw = await this.api.request<unknown>('/cash-sessions/current', {
      query: { registerId },
    });
    if (raw === null || raw === undefined) {
      this.remember(null);
      return null;
    }
    const session = cashSessionSchema.parse(raw);
    this.remember(session);
    return session;
  }

  async open(input: OpenShiftInput): Promise<CashSession> {
    const raw = await this.api.request<unknown>('/cash-sessions', {
      method: 'POST',
      body: {
        registerId: input.registerId,
        openingAmount: input.openingAmount,
        ...(input.note === undefined ? {} : { note: input.note }),
      },
    });
    const session = cashSessionSchema.parse(raw);
    this.rememberRegister(input.registerId);
    this.remember(session);
    return session;
  }

  /**
   * Vardiyayı kapatır.
   *
   * Kapanış ÇEVRİMİÇİ yapılır: beklenen nakit sunucudaki kasa hareketlerinden
   * çıkar, fark eşiği tenant ayarındadır ve kapanış denetim kaydı üretir. Kasada
   * hesaplanan bir kapanış, gönderilmemiş satışlar yüzünden yanlış olurdu.
   *
   * Kuyrukta bekleyen satış varken kapanış ENGELLENİR: o satışlar sunucuya
   * ulaşmadan beklenen nakit eksik hesaplanır ve kasiyer haksız yere "fark var"
   * uyarısı alır.
   */
  async close(input: CloseShiftInput, pendingSales: number): Promise<ShiftCloseResult> {
    if (!this.isOnline()) {
      throw new AppError('OFFLINE', 'Vardiya kapatmak için internet bağlantısı gerekli.');
    }
    const session = this.active;
    if (!session) throw new AppError('NO_SHIFT', 'Kapatılacak açık vardiya bulunamadı.');
    if (pendingSales > 0) {
      throw new AppError(
        'PENDING_SALES',
        `${String(pendingSales)} satış henüz sunucuya gönderilmedi; kapatmadan önce eşitleyin.`,
      );
    }

    const raw = await this.api.request<unknown>(`/cash-sessions/${session.id}/close`, {
      method: 'POST',
      body: {
        closingAmount: input.closingAmount,
        ...(input.note === undefined ? {} : { note: input.note }),
      },
    });
    const parsed = closeResultSchema.parse(raw);
    this.remember(null);
    return {
      closingAmount: parsed.session.closingAmount,
      expectedAmount: parsed.session.expectedAmount,
      differenceAmount: parsed.session.differenceAmount,
      overThreshold: parsed.overThreshold,
      closedAt: parsed.session.closedAt,
    };
  }

  /**
   * Kasa seçimi MAKİNEYE aittir — kullanıcı değişse de kasa aynı kalır.
   *
   * Seçim yalnız ekranın state'inde tutulamaz: `current()` ve `open()` kasayı
   * yapılandırmadan okur; yazılmadığı sürece "bu kasada açık vardiya var mı?"
   * sorusu yanlış cevap verir (ekran boş açılış formu gösterir, sunucu 409 der).
   */
  rememberRegister(registerId: string, registerName?: string): PosConfig {
    return this.config.patch({
      registerId,
      ...(registerName === undefined ? {} : { registerName }),
    });
  }
}
