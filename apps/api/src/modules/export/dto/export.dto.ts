import { z } from 'zod';

export const EXPORTABLE_REPORTS = [
  'sales',
  'profit',
  'top-products',
  'payment-distribution',
  'cashier-performance',
] as const;

export const createExportSchema = z
  .object({
    report: z.enum(EXPORTABLE_REPORTS),
    format: z.enum(['XLSX', 'PDF']),
    from: z.iso.datetime(),
    to: z.iso.datetime(),
    granularity: z.enum(['hour', 'day', 'week', 'month']).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

export type CreateExportInput = z.infer<typeof createExportSchema>;
