import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import type { AuthenticatedUser } from '../../modules/auth/auth.service.js';
import { TokenService } from '../../modules/auth/token.service.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { UnauthenticatedError } from '../errors/domain-error.js';

interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

/**
 * Varsayılan koruma: @Public() işaretlenmemiş her endpoint geçerli access token ister.
 *
 * Doğrulama başarılıysa tenant bağlamı AsyncLocalStorage'a kurulur; PrismaService
 * bunu `app.tenant_id` olarak veritabanına bildirir. tenantId İSTEMCİDEN DEĞİL,
 * yalnız imzalı token'dan gelir.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const header = request.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw new UnauthenticatedError('Yetkilendirme başlığı eksik.');
    }

    let payload;
    try {
      payload = await this.tokens.verifyAccessToken(header.slice(7));
    } catch {
      throw new UnauthenticatedError('Oturum geçersiz veya süresi dolmuş.');
    }

    request.user = {
      id: payload.sub,
      tenantId: payload.tenantId,
      email: '',
      fullName: '',
      permissions: payload.permissions,
      roles: [],
    };

    // Tenant bağlamı burada KURULMAZ — AsyncLocalStorage guard'dan handler'a
    // taşınmıyor. Bağlamı TenantContextInterceptor kuruyor.
    return true;
  }
}
