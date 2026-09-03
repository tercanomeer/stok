import { Injectable } from '@nestjs/common';

import { AuditAction } from '@stokk/db';
import { PERMISSIONS } from '@stokk/types';

import type { CreateRoleInput, UpdateRoleInput } from './dto/role.dto.js';
import { BusinessRuleError, NotFoundError } from '../../common/errors/domain-error.js';
import { PrismaService, type TenantTransaction } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';

const ROLE_SELECT = {
  id: true,
  name: true,
  description: true,
  isSystem: true,
  createdAt: true,
  permissions: { select: { permission: { select: { code: true } } } },
  _count: { select: { users: true } },
} as const;

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    return this.prisma.withTenant((tx) =>
      tx.role.findMany({ select: ROLE_SELECT, orderBy: [{ isSystem: 'desc' }, { name: 'asc' }] }),
    );
  }

  /** İzin matrisi ekranı için katalog — kaynak bazında gruplanmış. */
  async permissionCatalog() {
    const permissions = await this.prisma.system.permission.findMany({
      select: { code: true, resource: true, action: true, description: true },
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });

    const grouped = new Map<string, typeof permissions>();
    for (const permission of permissions) {
      const bucket = grouped.get(permission.resource) ?? [];
      bucket.push(permission);
      grouped.set(permission.resource, bucket);
    }

    return [...grouped].map(([resource, items]) => ({ resource, permissions: items }));
  }

  async create(input: CreateRoleInput) {
    const role = await this.prisma.withTenant(async (tx, tenantId) => {
      const created = await tx.role.create({
        data: {
          tenantId,
          name: input.name,
          description: input.description ?? null,
          isSystem: false,
        },
      });
      await this.syncPermissions(tx, created.id, input.permissions);
      return tx.role.findFirstOrThrow({ where: { id: created.id }, select: ROLE_SELECT });
    });

    await this.audit.record({
      action: AuditAction.CREATE,
      entity: 'Role',
      entityId: role.id,
      changes: { name: input.name, permissions: input.permissions },
    });

    return role;
  }

  async update(id: string, input: UpdateRoleInput) {
    const role = await this.prisma.withTenant(async (tx) => {
      const existing = await tx.role.findFirst({
        where: { id },
        select: { id: true, isSystem: true },
      });
      if (!existing) throw new NotFoundError('Rol bulunamadı.');

      // Sistem rollerinin adı değiştirilemez; izinleri düzenlenebilir.
      if (existing.isSystem && input.name !== undefined) {
        throw new BusinessRuleError('SYSTEM_ROLE_IMMUTABLE', 'Sistem rolünün adı değiştirilemez.');
      }

      if (input.permissions) {
        await this.assertAdminAccessSurvives(tx, id, input.permissions);
        await this.syncPermissions(tx, id, input.permissions);
      }

      await tx.role.update({
        where: { id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.description === undefined ? {} : { description: input.description }),
        },
      });

      return tx.role.findFirstOrThrow({ where: { id }, select: ROLE_SELECT });
    });

    await this.audit.record({
      action: AuditAction.UPDATE,
      entity: 'Role',
      entityId: id,
      changes: { ...input },
    });

    return role;
  }

  async remove(id: string): Promise<void> {
    await this.prisma.withTenant(async (tx) => {
      const role = await tx.role.findFirst({
        where: { id },
        select: { id: true, isSystem: true, _count: { select: { users: true } } },
      });
      if (!role) throw new NotFoundError('Rol bulunamadı.');
      if (role.isSystem) {
        throw new BusinessRuleError('SYSTEM_ROLE_IMMUTABLE', 'Sistem rolü silinemez.');
      }
      if (role._count.users > 0) {
        throw new BusinessRuleError('ROLE_IN_USE', 'Bu role atanmış kullanıcılar var.');
      }

      await tx.role.delete({ where: { id } });
    });

    await this.audit.record({ action: AuditAction.DELETE, entity: 'Role', entityId: id });
  }

  /**
   * Rolden `role.manage` kaldırılırken tenant'ta bu izne sahip AKTİF kullanıcı
   * kalıyor mu kontrol eder.
   *
   * Kalmıyorsa işlem reddedilir: tek Patron kendi rolünden bu izni kaldırırsa
   * rol yönetimine bir daha giremez ve geri dönüş yalnız veritabanı müdahalesiyle
   * olur — ekranın tek tıkla üretebileceği kalıcı kilitlenme.
   */
  private async assertAdminAccessSurvives(
    tx: TenantTransaction,
    roleId: string,
    nextPermissions: string[],
  ): Promise<void> {
    if (nextPermissions.includes(PERMISSIONS.ROLE_MANAGE)) return;

    const hadPermission = await tx.rolePermission.findFirst({
      where: { roleId, permission: { code: PERMISSIONS.ROLE_MANAGE } },
      select: { roleId: true },
    });
    if (!hadPermission) return; // Zaten yoktu, bir şey kaybedilmiyor.

    const otherAdmins = await tx.userRole.count({
      where: {
        user: { status: 'ACTIVE', deletedAt: null },
        roleId: { not: roleId },
        role: { permissions: { some: { permission: { code: PERMISSIONS.ROLE_MANAGE } } } },
      },
    });
    if (otherAdmins === 0) {
      throw new BusinessRuleError(
        'LAST_ROLE_ADMIN',
        'Bu izni kaldırırsanız rol yönetimine erişebilen kimse kalmaz. Önce başka bir kullanıcıya rol yönetme yetkisi verin.',
      );
    }
  }

  private async syncPermissions(
    tx: TenantTransaction,
    roleId: string,
    codes: string[],
  ): Promise<void> {
    const permissions = await tx.permission.findMany({
      where: { code: { in: codes } },
      select: { id: true },
    });

    await tx.rolePermission.deleteMany({ where: { roleId } });
    await tx.rolePermission.createMany({
      data: permissions.map((permission) => ({ roleId, permissionId: permission.id })),
      skipDuplicates: true,
    });
  }
}
