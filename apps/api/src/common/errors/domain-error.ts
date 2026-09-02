import { ErrorCode } from '@stokk/types';

/**
 * İş kuralı ihlalleri. Global filter bunları uygun HTTP koduna ve
 * `{ ok: false, error }` zarfına çevirir — CLAUDE.md "API sözleşmesi".
 *
 * Servis katmanı HttpException fırlatmaz, DomainError fırlatır: iş mantığı
 * HTTP'den habersiz kalır ve aynı hata POS/sync yolunda da kullanılabilir.
 */
export abstract class DomainError extends Error {
  abstract readonly status: number;
  abstract readonly code: string;
  readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.details = details;
  }
}

export class ValidationError extends DomainError {
  readonly status = 400;
  readonly code = ErrorCode.VALIDATION_FAILED;
}

/** İş kuralı ihlali — validation değil, alan doğru ama işlem yapılamaz. */
export class BusinessRuleError extends DomainError {
  readonly status = 400;
  readonly code: string;

  constructor(code: string, message: string, details?: unknown) {
    super(message, details);
    this.code = code;
  }
}

export class UnauthenticatedError extends DomainError {
  readonly status = 401;
  readonly code = ErrorCode.UNAUTHENTICATED;

  constructor(message = 'Kimlik doğrulanamadı.') {
    super(message);
  }
}

export class ForbiddenError extends DomainError {
  readonly status = 403;
  readonly code = ErrorCode.FORBIDDEN;

  constructor(message = 'Bu işlem için yetkiniz yok.', details?: unknown) {
    super(message, details);
  }
}

export class NotFoundError extends DomainError {
  readonly status = 404;
  readonly code = ErrorCode.NOT_FOUND;

  constructor(message = 'Kayıt bulunamadı.') {
    super(message);
  }
}

export class ConflictError extends DomainError {
  readonly status = 409;
  readonly code = ErrorCode.CONFLICT;
}

export class PlanLimitError extends DomainError {
  readonly status = 402;
  readonly code = ErrorCode.PLAN_LIMIT_EXCEEDED;
}
