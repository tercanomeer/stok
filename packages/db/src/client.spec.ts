import { describe, expect, it } from 'vitest';

import { createPrismaClient } from './client';

describe('createPrismaClient', () => {
  it('boş DATABASE_URL ile client oluşturmaz', () => {
    expect(() => createPrismaClient('')).toThrow(/DATABASE_URL/);
  });
});
