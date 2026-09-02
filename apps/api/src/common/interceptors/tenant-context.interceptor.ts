import { Injectable } from '@nestjs/common';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';

import type { AuthenticatedUser } from '../../modules/auth/auth.service.js';
import { runWithTenantContext } from '../../prisma/tenant-context.js';

interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

/**
 * Tenant bağlamını handler'ın çalıştığı async zincire kurar.
 *
 * Bunu guard'da yapmak ÇALIŞMIYOR: `AsyncLocalStorage.enterWith` guard'ın kendi
 * async devamına yazılır, Nest `await guard.canActivate()` dönüşünde çağıranın
 * bağlamına geri döner ve handler bağlamı göremez. Interceptor ise `next.handle()`
 * aboneliğini `storage.run()` içinde başlatabildiği için handler ve altındaki tüm
 * iş bağlamı devralır.
 *
 * Guard'lardan SONRA çalışır; `request.user` bu noktada doğrulanmış durumdadır.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const user = context.switchToHttp().getRequest<RequestWithUser>().user;

    if (!user) {
      return next.handle();
    }

    return new Observable((subscriber) => {
      const subscription = runWithTenantContext(
        { tenantId: user.tenantId, userId: user.id, permissions: user.permissions },
        () => next.handle().subscribe(subscriber),
      );
      return () => subscription.unsubscribe();
    });
  }
}
