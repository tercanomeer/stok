import { describe, expect, it } from 'vitest';

import { backoffMs, MAX_ATTEMPTS, nextAttemptAt, RETRY_MAX_MS } from './backoff';

describe('backoffMs', () => {
  it('ilk denemeden sonra taban süreyi verir', () => {
    expect(backoffMs(1, () => 0.5)).toBe(5_000);
  });

  it('her denemede ikiye katlar', () => {
    const half = (): number => 0.5;
    expect(backoffMs(2, half)).toBe(10_000);
    expect(backoffMs(3, half)).toBe(20_000);
    expect(backoffMs(4, half)).toBe(40_000);
  });

  it('tavanı aşmaz', () => {
    expect(backoffMs(20, () => 0.5)).toBe(RETRY_MAX_MS);
  });

  it('jitter uygular: aynı deneme farklı süreler üretir', () => {
    expect(backoffMs(1, () => 0)).toBe(4_000);
    expect(backoffMs(1, () => 1)).toBe(6_000);
  });
});

describe('nextAttemptAt', () => {
  it('şimdiki ana bekleme süresini ekler', () => {
    const now = new Date('2026-09-03T10:00:00.000Z');
    expect(nextAttemptAt(1, now, () => 0.5)).toBe('2026-09-03T10:00:05.000Z');
  });
});

describe('MAX_ATTEMPTS', () => {
  it('plandaki 5 deneme sınırıyla aynı', () => {
    expect(MAX_ATTEMPTS).toBe(5);
  });
});
