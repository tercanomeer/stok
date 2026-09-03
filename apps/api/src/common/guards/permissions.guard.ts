import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import type { Permission } from '@stokk/types';

import type { AuthenticatedUser } from '../../modules/auth/auth.service.js';
import { NO_PERMISSION_KEY, PERMISSIONS_KEY } from '../decorators/permissions.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { ForbiddenError } from '../errors/domain-error.js';

interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

/**
 * İzin kontrolü token'daki izin listesine bakar (03-mimari.md "Kimlik & yetki").
 * Rol değişince kullanıcının yeni izinleri en geç access token yenilendiğinde
 * (15 dk) yürürlüğe girer — bilinen ve kabul edilmiş gecikme.
 *
 * VARSAYILAN KAPALI: `@Permissions()` de `@NoPermissionRequired()` de taşımayan
 * bir uç reddedilir. Önceden varsayılan açıktı; decorator eklemeyi unutmak
 * kimliği doğrulanmış herkese (kasiyer dahil) açık bir uç bırakıyordu ve bunu
 * ne derleyici ne test yakalıyordu (security-auditor bulgusu).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // `@Public()` uçlarda kullanıcı yok (JwtAuthGuard bunları geçirir); izin
    // kontrolü de yapılmaz. Bu kontrol EN BAŞTA olmalı — aşağıdaki kapalı
    // varsayılan yoksa giriş/kayıt uçlarını da reddederdi.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const user = context.switchToHttp().getRequest<RequestWithUser>().user;
    if (!user) {
      throw new ForbiddenError('Bu işlem için kimlik doğrulaması gerekli.');
    }

    if (!required || required.length === 0) {
      const optedOut = this.reflector.getAllAndOverride<boolean>(NO_PERMISSION_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (optedOut) return true;
      throw new ForbiddenError(
        'Bu uç için izin tanımlanmamış. @Permissions() veya @NoPermissionRequired() ekleyin.',
      );
    }

    const granted = new Set(user.permissions);
    const missing = required.filter((permission) => !granted.has(permission));

    if (missing.length > 0) {
      throw new ForbiddenError('Bu işlem için yetkiniz yok.', { required: missing });
    }

    return true;
  }
}
