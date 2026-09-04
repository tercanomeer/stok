import { z } from 'zod';

import type { ApiClient } from './api-client';
import type { ConfigStore } from './config-store';
import type { CashSession, OpenShiftInput, PosConfig, Register } from '../shared/ipc-contracts';

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
  ) {}

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
    if (raw === null || raw === undefined) return null;
    return cashSessionSchema.parse(raw);
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
    return session;
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
