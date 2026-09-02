import { Injectable } from '@nestjs/common';

import { AuditAction, Prisma } from '@stokk/db';

import { ConflictError, NotFoundError } from '../../common/errors/domain-error.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { CreateRegisterInput, UpdateRegisterInput } from './dto/register.dto.js';

const SELECT = {
  id: true,
  name: true,
  deviceId: true,
  isActive: true,
  createdAt: true,
} as const;

@Injectable()
export class RegisterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    return this.prisma.withTenant((tx) =>
      tx.register.findMany({
        where: { deletedAt: null },
        select: SELECT,
        orderBy: { createdAt: 'asc' },
      }),
    );
  }

  async findOne(id: string) {
    const register = await this.prisma.withTenant((tx) =>
      tx.register.findFirst({ where: { id, deletedAt: null }, select: SELECT }),
    );
    if (!register) throw new NotFoundError('Kasa bulunamadı.');
    return register;
  }

  async create(input: CreateRegisterInput) {
    const register = await this.prisma.withTenant(async (tx, tenantId) => {
      try {
        return await tx.register.create({
          data: { tenantId, name: input.name, deviceId: input.deviceId ?? null },
          select: SELECT,
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictError('Bu isimde bir kasa zaten var.');
        }
        throw error;
      }
    });
    await this.audit.record({
      action: AuditAction.CREATE,
      entity: 'Register',
      entityId: register.id,
    });
    return register;
  }

  async update(id: string, input: UpdateRegisterInput) {
    const register = await this.prisma.withTenant(async (tx) => {
      const existing = await tx.register.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!existing) throw new NotFoundError('Kasa bulunamadı.');
      return tx.register.update({
        where: { id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.deviceId === undefined ? {} : { deviceId: input.deviceId }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        },
        select: SELECT,
      });
    });
    await this.audit.record({ action: AuditAction.UPDATE, entity: 'Register', entityId: id });
    return register;
  }

  async remove(id: string): Promise<void> {
    await this.prisma.withTenant(async (tx) => {
      const register = await tx.register.findFirst({
        where: { id, deletedAt: null },
        select: {
          id: true,
          cashSessions: { where: { status: 'OPEN' }, select: { id: true }, take: 1 },
        },
      });
      if (!register) throw new NotFoundError('Kasa bulunamadı.');
      if (register.cashSessions.length > 0) {
        throw new ConflictError('Açık vardiyası olan kasa silinemez.');
      }
      await tx.register.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    });
    await this.audit.record({ action: AuditAction.DELETE, entity: 'Register', entityId: id });
  }
}
