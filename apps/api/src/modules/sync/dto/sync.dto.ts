import { z } from 'zod';

import { createSaleSchema } from '../../sales/dto/sale.dto.js';

export const pullQuerySchema = z.object({ since: z.iso.datetime().optional() }).strict();

export const pushSalesSchema = z
  .object({ sales: z.array(createSaleSchema).min(1).max(200) })
  .strict();

export type PullQueryInput = z.infer<typeof pullQuerySchema>;
export type PushSalesInput = z.infer<typeof pushSalesSchema>;
