import { z } from 'zod';

import { paginationSchema } from '../../../common/pagination/pagination.js';

export const listAuditLogsSchema = paginationSchema.extend({
  action: z.enum(['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'LOGIN_FAILED']).optional(),
  /** Varlık adı (Product, Sale, TenantSettings…) — tam eşleşme. */
  entity: z.string().trim().max(60).optional(),
  userId: z.string().min(1).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});

export type ListAuditLogsInput = z.infer<typeof listAuditLogsSchema>;
