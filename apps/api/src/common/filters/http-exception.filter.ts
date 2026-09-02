import { Catch, HttpException, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

import { Prisma } from '@stokk/db';
import { ErrorCode, type ApiError } from '@stokk/types';

import { DomainError } from '../errors/domain-error.js';

interface NestExceptionBody {
  message?: unknown;
  error?: unknown;
}

/**
 * Her hatayı `{ ok: false, error: { code, message, details } }` zarfına çevirir.
 * Zarfın başarılı tarafı TransformResponseInterceptor'da.
 *
 * Bilinmeyen hataların mesajı istemciye SIZDIRILMAZ — yalnız log'a yazılır.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toEnvelope(exception);

    if (status >= 500) {
      this.logger.error(
        exception instanceof Error ? exception.message : 'Bilinmeyen hata',
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json(body);
  }

  private toEnvelope(exception: unknown): { status: number; body: ApiError } {
    if (exception instanceof DomainError) {
      return {
        status: exception.status,
        body: {
          ok: false,
          error: {
            code: exception.code,
            message: exception.message,
            ...(exception.details === undefined ? {} : { details: exception.details }),
          },
        },
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrisma(exception);
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      // 5xx'te iç mesaj istemciye SIZDIRILMAZ; 429'da kütüphanenin İngilizce mesajı
      // yerine Türkçe sabit (CLAUDE.md: UI metinleri Türkçe).
      const message =
        status >= 500
          ? 'Beklenmeyen bir hata oluştu.'
          : status === 429
            ? 'Çok fazla istek gönderildi, lütfen biraz bekleyin.'
            : extractMessage(payload, exception.message);

      return {
        status,
        body: {
          ok: false,
          error: { code: this.codeForStatus(status), message },
        },
      };
    }

    return {
      status: 500,
      body: {
        ok: false,
        error: { code: ErrorCode.INTERNAL_ERROR, message: 'Beklenmeyen bir hata oluştu.' },
      },
    };
  }

  private fromPrisma(error: Prisma.PrismaClientKnownRequestError): {
    status: number;
    body: ApiError;
  } {
    // P2002 benzersizlik ihlali, P2025 kayıt bulunamadı — 03-mimari.md "Ortak patternler".
    if (error.code === 'P2002') {
      const target = error.meta?.['target'];
      return {
        status: 409,
        body: {
          ok: false,
          error: {
            code: ErrorCode.CONFLICT,
            message: 'Bu kayıt zaten mevcut.',
            ...(target === undefined ? {} : { details: { fields: target } }),
          },
        },
      };
    }

    if (error.code === 'P2025') {
      return {
        status: 404,
        body: { ok: false, error: { code: ErrorCode.NOT_FOUND, message: 'Kayıt bulunamadı.' } },
      };
    }

    this.logger.error(`İşlenmemiş Prisma hatası ${error.code}: ${error.message}`);
    return {
      status: 500,
      body: {
        ok: false,
        error: { code: ErrorCode.INTERNAL_ERROR, message: 'Beklenmeyen bir hata oluştu.' },
      },
    };
  }

  private codeForStatus(status: number): string {
    switch (status) {
      case 401:
        return ErrorCode.UNAUTHENTICATED;
      case 402:
        return ErrorCode.PLAN_LIMIT_EXCEEDED;
      case 403:
        return ErrorCode.FORBIDDEN;
      case 404:
        return ErrorCode.NOT_FOUND;
      case 409:
        return ErrorCode.CONFLICT;
      case 429:
        return ErrorCode.RATE_LIMITED;
      case 400:
      case 422:
        return ErrorCode.VALIDATION_FAILED;
      default:
        return ErrorCode.INTERNAL_ERROR;
    }
  }
}

/** Nest'in hata gövdesi string, string[] veya nesne olabilir; hiçbirinde `[object Object]` istemiyoruz. */
function extractMessage(payload: string | object, fallback: string): string {
  if (typeof payload === 'string') return payload;

  const message = (payload as NestExceptionBody).message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.filter((part) => typeof part === 'string').join(', ');

  return fallback;
}
