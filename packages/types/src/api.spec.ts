import { describe, expect, it } from 'vitest';

import { isApiError, type ApiResponse } from './api';

describe('isApiError', () => {
  it('başarılı yanıtı hata saymaz', () => {
    const response: ApiResponse<{ id: string }> = { ok: true, data: { id: '1' } };
    expect(isApiError(response)).toBe(false);
  });

  it('hatalı yanıtı hata sayar ve kodu okunabilir', () => {
    const response: ApiResponse<never> = {
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Bulunamadı' },
    };
    expect(isApiError(response)).toBe(true);
    if (isApiError(response)) {
      expect(response.error.code).toBe('NOT_FOUND');
    }
  });
});
