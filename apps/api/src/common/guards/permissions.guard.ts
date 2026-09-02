import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import type { Permission } from '@stokk/types';

import type { AuthenticatedUser } from '../../modules/auth/auth.service.js';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator.js';
import { ForbiddenError } from '../errors/domain-error.js';

interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

/**
 * İzin kontrolü token'daki izin listesine bakar (03-mimari.md "Kimlik & yetki").
 * Rol değişince kullanıcının yeni izinleri en geç access token yenilendiğinde
 * (15 dk) yürürlüğe girer — bilinen ve kabul edilmiş gecikme.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest<RequestWithUser>().user;
    if (!user) return false;

    const granted = new Set(user.permissions);
    const missing = required.filter((permission) => !granted.has(permission));

    if (missing.length > 0) {
      throw new ForbiddenError('Bu işlem için yetkiniz yok.', { required: missing });
    }

    return true;
  }
}
