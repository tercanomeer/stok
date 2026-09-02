import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { AuthenticatedUser } from '../../modules/auth/auth.service.js';

interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

/** Doğrulanmış kullanıcı. JwtAuthGuard'dan geçmiş endpoint'lerde her zaman dolu. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!request.user) {
      throw new Error('CurrentUser korumasız bir endpoint’te kullanıldı.');
    }
    return request.user;
  },
);
