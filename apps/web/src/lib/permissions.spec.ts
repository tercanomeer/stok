import { describe, expect, it } from 'vitest';

import { PERMISSIONS } from '@stokk/types';

import { hasPermission } from './permissions';

describe('hasPermission', () => {
  it('izin listesinde olan kodu döndürür', () => {
    expect(hasPermission([PERMISSIONS.SALE_VIEW], PERMISSIONS.SALE_VIEW)).toBe(true);
  });

  it('olmayan izin için false', () => {
    expect(hasPermission([PERMISSIONS.SALE_VIEW], PERMISSIONS.REPORT_PROFIT_VIEW)).toBe(false);
  });

  it('boş izin listesi her zaman false', () => {
    expect(hasPermission([], PERMISSIONS.PRODUCT_VIEW)).toBe(false);
  });
});
