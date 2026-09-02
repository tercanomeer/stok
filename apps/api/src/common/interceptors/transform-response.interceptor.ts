import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';

import type { ApiSuccess } from '@stokk/types';

/**
 * Her başarılı yanıtı `{ ok: true, data }` zarfına sarar — CLAUDE.md "API sözleşmesi".
 * Hata zarfı (`{ ok: false, error }`) Faz 2'de HttpExceptionFilter ile eklenir.
 */
@Injectable()
export class TransformResponseInterceptor<T> implements NestInterceptor<T, ApiSuccess<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<ApiSuccess<T>> {
    return next.handle().pipe(map((data): ApiSuccess<T> => ({ ok: true, data })));
  }
}
