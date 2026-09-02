/**
 * Seed — idempotent. İkinci kez çalıştırıldığında hata vermez, kopya üretmez.
 *
 * İki bölüm:
 *  1. Sistem geneli izin kataloğu (`permissions`). Her ortamda çalışır.
 *  2. Geliştirme tenant'ı: sistem rolleri, birimler, KDV oranları, varsayılan
 *     kategoriler ve kasa. NODE_ENV=production'da ATLANIR.
 *
 * Rol → izin eşlemesi `@stokk/types` içindeki SYSTEM_ROLE_PERMISSIONS'tan gelir;
 * Faz 2'deki kayıt akışı da aynı tanımı kullanacak, ikinci bir liste tutulmaz.
 */
import path from 'node:path';

import { config as loadEnv } from 'dotenv';

import { ALL_PERMISSIONS, SYSTEM_ROLES, SYSTEM_ROLE_PERMISSIONS } from '@stokk/types';

import { createPrismaClient } from '../src/client';
import type { PrismaClient } from '../src/generated/prisma/client';

/// Sabit id — seed'in idempotent olması için tenant her çalıştırmada aynı satıra denk gelmeli.
const DEV_TENANT_ID = 'seed_dev_tenant';

interface UnitSeed {
  name: string;
  abbreviation: string;
  allowsDecimal: boolean;
}

const UNITS: readonly UnitSeed[] = [
  { name: 'Adet', abbreviation: 'ad', allowsDecimal: false },
  { name: 'Kilogram', abbreviation: 'kg', allowsDecimal: true },
  { name: 'Gram', abbreviation: 'gr', allowsDecimal: true },
  { name: 'Litre', abbreviation: 'lt', allowsDecimal: true },
  { name: 'Mililitre', abbreviation: 'ml', allowsDecimal: true },
  { name: 'Metre', abbreviation: 'm', allowsDecimal: true },
  { name: 'Paket', abbreviation: 'pk', allowsDecimal: false },
  { name: 'Kutu', abbreviation: 'kt', allowsDecimal: false },
  { name: 'Koli', abbreviation: 'kl', allowsDecimal: false },
];

const CATEGORIES: readonly string[] = [
  'Gıda',
  'İçecek',
  'Temizlik',
  'Kişisel Bakım',
  'Kırtasiye',
  'Tütün Mamulleri',
  'Diğer',
];

const EXPENSE_CATEGORIES: readonly string[] = [
  'Kira',
  'Elektrik',
  'Su',
  'Doğalgaz',
  'İnternet & Telefon',
  'Personel',
  'Nakliye',
  'Diğer',
];

/** İzin kataloğu — sistem geneli, tenant'a bağlı değil. */
async function seedPermissions(prisma: PrismaClient): Promise<number> {
  for (const code of ALL_PERMISSIONS) {
    const [resource, ...actionParts] = code.split('.');
    const action = actionParts.join('.');

    await prisma.permission.upsert({
      where: { code },
      update: { resource: resource ?? code, action },
      create: { code, resource: resource ?? code, action },
    });
  }

  return prisma.permission.count();
}

async function seedDevTenant(prisma: PrismaClient): Promise<void> {
  const tenant = await prisma.tenant.upsert({
    where: { id: DEV_TENANT_ID },
    update: {},
    create: {
      id: DEV_TENANT_ID,
      name: 'Stokk Geliştirme Market',
      legalName: 'Stokk Geliştirme Gıda Ticaret Ltd. Şti.',
      status: 'ACTIVE',
      plan: 'PREMIUM',
    },
  });

  await prisma.tenantSettings.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      vatRates: [1, 10, 20],
      defaultVatRate: 20,
    },
  });

  // --- Sistem rolleri + izinleri ---
  for (const roleName of Object.values(SYSTEM_ROLES)) {
    const role = await prisma.role.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: roleName } },
      update: { isSystem: true },
      create: { tenantId: tenant.id, name: roleName, isSystem: true },
    });

    const codes = SYSTEM_ROLE_PERMISSIONS[roleName];
    const permissions = await prisma.permission.findMany({
      where: { code: { in: [...codes] } },
      select: { id: true },
    });

    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId: role.id,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });
  }

  // --- Birimler ---
  for (const unit of UNITS) {
    await prisma.unit.upsert({
      where: { tenantId_abbreviation: { tenantId: tenant.id, abbreviation: unit.abbreviation } },
      update: { name: unit.name, allowsDecimal: unit.allowsDecimal },
      create: { tenantId: tenant.id, ...unit },
    });
  }

  // --- Kategoriler ---
  // parentId null olduğu için bileşik unique upsert'te kullanılamıyor (Postgres NULL'ları
  // birbirinden farklı sayar). Kök kategoriler kısmi unique indeksle korunuyor; burada
  // idempotentlik için önce aranıyor.
  for (const [index, name] of CATEGORIES.entries()) {
    const existing = await prisma.category.findFirst({
      where: { tenantId: tenant.id, name, parentId: null },
      select: { id: true },
    });

    if (!existing) {
      await prisma.category.create({
        data: { tenantId: tenant.id, name, sortOrder: index },
      });
    }
  }

  // --- Gider kategorileri ---
  for (const name of EXPENSE_CATEGORIES) {
    await prisma.expenseCategory.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name } },
      update: {},
      create: { tenantId: tenant.id, name },
    });
  }

  // --- Varsayılan kasa ---
  await prisma.register.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Kasa 1' } },
    update: {},
    create: { tenantId: tenant.id, name: 'Kasa 1' },
  });
}

async function main(): Promise<void> {
  loadEnv({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL tanımlı değil — seed çalıştırılamaz.');
  }

  const prisma = createPrismaClient(databaseUrl);

  try {
    const permissionCount = await seedPermissions(prisma);
    console.warn(`[seed] izin kataloğu: ${permissionCount} kayıt`);

    if (process.env.NODE_ENV === 'production') {
      console.warn('[seed] production — geliştirme tenant’ı atlandı.');
      return;
    }

    await seedDevTenant(prisma);

    const [roles, units, categories, expenseCategories, registers] = await Promise.all([
      prisma.role.count({ where: { tenantId: DEV_TENANT_ID } }),
      prisma.unit.count({ where: { tenantId: DEV_TENANT_ID } }),
      prisma.category.count({ where: { tenantId: DEV_TENANT_ID } }),
      prisma.expenseCategory.count({ where: { tenantId: DEV_TENANT_ID } }),
      prisma.register.count({ where: { tenantId: DEV_TENANT_ID } }),
    ]);

    console.warn(
      `[seed] geliştirme tenant'ı: ${roles} rol, ${units} birim, ${categories} kategori, ` +
        `${expenseCategories} gider kategorisi, ${registers} kasa`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('[seed] başarısız:', error);
  process.exitCode = 1;
});
