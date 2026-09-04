import { z } from 'zod';

import type { ApiClient } from './api-client';
import { AppError } from '../lib/app-error';
import type { ContactSummary } from '../shared/ipc-contracts';

const contactSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().nullable().default(null),
  balance: z.coerce.string(),
  creditLimit: z.coerce.string().nullable().default(null),
});

const listSchema = z.object({ items: z.array(contactSchema) });

/**
 * Veresiye satışın müşteri kaynağı.
 *
 * Cariler POS'ta ÖNBELLEKLENMİYOR: bakiye ve kredi limiti canlı veridir, eski bir
 * kopyaya bakarak limit aşımına izin vermek gerçek bir zarardır. Bunun bedeli,
 * internet kesikken veresiye satış yapılamamasıdır — ekran bunu açıkça söyler.
 * Cari önbelleği ayrı bir senkronizasyon kararı; Faz 15'e bırakıldı.
 */
export class ContactService {
  constructor(
    private readonly api: ApiClient,
    private readonly isOnline: () => boolean,
  ) {}

  async search(query: string): Promise<ContactSummary[]> {
    if (!this.isOnline()) {
      throw new AppError('OFFLINE', 'Müşteri araması için internet bağlantısı gerekli.');
    }
    const raw = await this.api.request<unknown>('/contacts', {
      query: {
        type: 'CUSTOMER',
        limit: '20',
        ...(query.trim() === '' ? {} : { search: query.trim() }),
      },
    });
    return listSchema.parse(raw).items;
  }
}
