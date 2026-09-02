import type { PipeTransform } from '@nestjs/common';
import { type z } from 'zod';

import { ValidationError } from '../errors/domain-error.js';

interface FieldIssue {
  path: string;
  message: string;
}

/**
 * Zod ile strict parse — CLAUDE.md "Validation her endpoint'te Zod ile strict parse".
 * Şema `.strict()` olduğunda fazladan alan da hata verir, sessizce yutulmaz.
 */
export class ZodValidationPipe<TSchema extends z.ZodType> implements PipeTransform {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.infer<TSchema> {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      const fields: FieldIssue[] = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));

      throw new ValidationError('Gönderilen veri geçersiz.', { fields });
    }

    return result.data;
  }
}
