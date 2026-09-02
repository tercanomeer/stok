import { Injectable } from '@nestjs/common';
import { hash as bcryptHash } from 'bcrypt';

import { AuditAction } from '@stokk/db';

import type { CreateUserInput, UpdateUserInput } from './dto/user.dto.js';
import {
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
} from '../../common/errors/domain-error.js';
import { PrismaService, type TenantTransaction } from '../../prisma/prisma.service.js';
import { getTenantContext } from '../../prisma/tenant-context.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthService } from '../auth/auth.service.js';

const BCRYPT_ROUNDS = 12;

const USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  roles: { select: { role: { select: { id: true, name: true } } } },
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {}

  async list() {
    return this.prisma.withTenant((tx) =>
      tx.user.findMany({
        where: { deletedAt: null },
        select: USER_SELECT,
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async findOne(id: string) {
    const user = await this.prisma.withTenant((tx) =>
      tx.user.findFirst({ where: { id, deletedAt: null }, select: USER_SELECT }),
    );

    // RLS başka tenant'ın kaydını zaten görünmez kılıyor; burada 404 dönmesi
    // "var ama yetkin yok" bilgisini de sızdırmaz.
    if (!user) throw new NotFoundError('Kullanıcı bulunamadı.');
    return user;
  }

  async create(input: CreateUserInput) {
    const email = input.email.toLowerCase();

    // E-posta platform genelinde benzersiz; RLS altındaki sorgu başka tenant'taki
    // kaydı göremeyeceği için kontrol sahip istemcisiyle yapılıyor.
    const taken = await this.prisma.system.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (taken) {
      throw new BusinessRuleError('EMAIL_ALREADY_REGISTERED', 'Bu e-posta zaten kayıtlı.');
    }

    const passwordHash = await bcryptHash(input.password, BCRYPT_ROUNDS);

    const user = await this.prisma.withTenant(async (tx, tenantId) => {
      await this.assertRolesAssignable(tx, input.roleIds);

      return tx.user.create({
        data: {
          tenantId,
          email,
          passwordHash,
          fullName: input.fullName,
          phone: input.phone ?? null,
          roles: { create: input.roleIds.map((roleId) => ({ roleId })) },
        },
        select: USER_SELECT,
      });
    });

    await this.audit.record({
      action: AuditAction.CREATE,
      entity: 'User',
      entityId: user.id,
      changes: { email, fullName: input.fullName, roleIds: input.roleIds },
    });

    return user;
  }

  async update(id: string, input: UpdateUserInput) {
    const user = await this.prisma.withTenant(async (tx) => {
      const existing = await tx.user.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!existing) throw new NotFoundError('Kullanıcı bulunamadı.');

      if (input.roleIds) {
        if (id === getTenantContext()?.userId) {
          throw new ForbiddenError('Kendi rollerinizi değiştiremezsiniz.');
        }
        await this.assertRolesAssignable(tx, input.roleIds);
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({
          data: input.roleIds.map((roleId) => ({ userId: id, roleId })),
        });
      }

      return tx.user.update({
        where: { id },
        data: {
          ...(input.fullName === undefined ? {} : { fullName: input.fullName }),
          ...(input.phone === undefined ? {} : { phone: input.phone }),
          ...(input.status === undefined ? {} : { status: input.status }),
        },
        select: USER_SELECT,
      });
    });

    // Pasifleştirilen kullanıcının açık oturumları düşürülür; aksi halde refresh
    // rotasyonuyla erişim sürerdi (bkz. güvenlik denetimi Faz 2).
    if (input.status === 'INACTIVE') {
      await this.auth.revokeAllSessions(id);
    }

    await this.audit.record({
      action: AuditAction.UPDATE,
      entity: 'User',
      entityId: id,
      changes: { ...input },
    });

    return user;
  }

  async deactivate(id: string): Promise<void> {
    await this.prisma.withTenant(async (tx) => {
      const existing = await tx.user.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!existing) throw new NotFoundError('Kullanıcı bulunamadı.');

      await tx.user.update({ where: { id }, data: { status: 'INACTIVE', deletedAt: new Date() } });
    });

    await this.auth.revokeAllSessions(id);
    await this.audit.record({ action: AuditAction.DELETE, entity: 'User', entityId: id });
  }

  /**
   * Atanacak rolleri iki açıdan doğrular:
   *  1. Hepsi çağıranın tenant'ında var (RLS zaten görünmez kılıyor; bu, sessiz boş
   *     sonuç yerine anlamlı hata veriyor).
   *  2. Rollerin verdiği hiçbir izin, çağıranın SAHİP OLMADIĞI bir izin değil. Yoksa
   *     `user.manage` iznine sahip biri PATRON rolünü atayıp tüm yetkilere yükselebilirdi.
   */
  private async assertRolesAssignable(tx: TenantTransaction, roleIds: string[]): Promise<void> {
    const roles = await tx.role.findMany({
      where: { id: { in: roleIds } },
      select: { id: true, permissions: { select: { permission: { select: { code: true } } } } },
    });

    if (roles.length !== roleIds.length) {
      throw new BusinessRuleError('ROLE_NOT_FOUND', 'Seçilen rollerden biri bulunamadı.');
    }

    const callerPermissions = new Set(getTenantContext()?.permissions ?? []);
    const escalating = new Set<string>();
    for (const role of roles) {
      for (const rp of role.permissions) {
        if (!callerPermissions.has(rp.permission.code)) escalating.add(rp.permission.code);
      }
    }

    if (escalating.size > 0) {
      throw new ForbiddenError('Sahip olmadığınız yetkileri içeren bir rol atayamazsınız.', {
        permissions: [...escalating],
      });
    }
  }
}
