import { z } from 'zod';

import { paginationSchema } from '../../../common/pagination/pagination.js';

export const listEInvoicesSchema = paginationSchema.extend({
  status: z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'CANCELLED']).optional(),
});

export type ListEInvoicesInput = z.infer<typeof listEInvoicesSchema>;
