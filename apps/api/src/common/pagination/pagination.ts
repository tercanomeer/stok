import { z } from 'zod';

import type { Paginated, PaginationMeta } from '@stokk/types';

/**
 * Ortak sayfalama sorgusu — CLAUDE.md: ?page=1&limit=20&sort=createdAt:desc&search=
 * Her liste endpoint'i bu şemayı genişletir.
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

export function paginate<T>(items: T[], total: number, input: PaginationInput): Paginated<T> {
  const meta: PaginationMeta = {
    total,
    page: input.page,
    limit: input.limit,
    pages: Math.max(1, Math.ceil(total / input.limit)),
  };
  return { items, meta };
}

/** Prisma `skip`/`take`. */
export function toSkipTake(input: PaginationInput): { skip: number; take: number } {
  return { skip: (input.page - 1) * input.limit, take: input.limit };
}

/**
 * `sort=alan:yon` ifadesini güvenli Prisma orderBy'a çevirir.
 * İzin verilen alan listesi dışındaki değerler varsayılana düşer — enjeksiyon yok.
 */
export function parseSort<TField extends string>(
  raw: string | undefined,
  allowed: readonly TField[],
  fallback: { field: TField; direction: 'asc' | 'desc' },
): { field: TField; direction: 'asc' | 'desc' } {
  if (!raw) return fallback;

  const [field, direction] = raw.split(':');
  if (!field || !(allowed as readonly string[]).includes(field)) return fallback;

  return { field: field as TField, direction: direction === 'asc' ? 'asc' : 'desc' };
}
