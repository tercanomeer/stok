import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { TENANT_SCOPED_MODELS } from './tenant-scoped';

/** Şemadan `tenantId` alanı taşıyan model adlarını çıkarır. */
function modelsWithTenantIdFromSchema(): string[] {
  const schema = readFileSync(path.resolve(__dirname, '../prisma/schema.prisma'), 'utf8');

  const models: string[] = [];
  const modelPattern = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;

  let match: RegExpExecArray | null;
  while ((match = modelPattern.exec(schema)) !== null) {
    const [, name, body] = match;
    if (name && body && /^\s*tenantId\s+String/m.test(body)) {
      models.push(name);
    }
  }

  return models.sort();
}

describe('TENANT_SCOPED_MODELS', () => {
  it('şemadaki tenantId taşıyan modellerle birebir aynı', () => {
    // Bu test yeni bir tenant'a bağlı model eklenip listeye yazılmadığında kırılır.
    // Liste Prisma tenant extension'ını besliyor; eksik kalan model otomatik
    // tenantId filtresi almaz ve yalnız RLS'e kalır.
    expect([...TENANT_SCOPED_MODELS].sort()).toEqual(modelsWithTenantIdFromSchema());
  });

  it('Permission listede değil — sistem geneli katalog', () => {
    expect(TENANT_SCOPED_MODELS as readonly string[]).not.toContain('Permission');
  });
});
