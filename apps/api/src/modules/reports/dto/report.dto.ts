import { z } from 'zod';

const range = {
  from: z.iso.datetime(),
  to: z.iso.datetime(),
};

export const rangeSchema = z.object(range).strict();

export const salesReportSchema = z
  .object({ ...range, granularity: z.enum(['hour', 'day', 'week', 'month']).default('day') })
  .strict();

export const topProductsSchema = z
  .object({ ...range, limit: z.coerce.number().int().min(1).max(100).default(10) })
  .strict();

export const dailyShiftSchema = z.object({ date: z.iso.date() }).strict();

export type RangeInput = z.infer<typeof rangeSchema>;
export type SalesReportInput = z.infer<typeof salesReportSchema>;
export type TopProductsInput = z.infer<typeof topProductsSchema>;
export type DailyShiftInput = z.infer<typeof dailyShiftSchema>;
