import {
  Injectable,
  StreamableFile,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';

import type { ApiSuccess } from '@stokk/types';

/**
 * Her başarılı yanıtı `{ ok: true, data }` zarfına sarar — CLAUDE.md "API sözleşmesi".
 * Hata zarfı (`{ ok: false, error }`) Faz 2'de HttpExceptionFilter ile eklenir.
 *
 * İkili dosya yanıtları (StreamableFile — ör. ekstre Excel) zarflanmaz: binary body
 * olduğu gibi akıtılır, Content-Type/Disposition başlıkları controller'da set edilir.
 */
@Injectable()
export class TransformResponseInterceptor<T> implements NestInterceptor<T, ApiSuccess<T> | T> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<ApiSuccess<T> | T> {
    return next
      .handle()
      .pipe(
        map((data): ApiSuccess<T> | T =>
          data instanceof StreamableFile ? data : { ok: true, data },
        ),
      );
  }
}
