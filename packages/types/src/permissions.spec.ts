import { describe, expect, it } from 'vitest';

import { ALL_PERMISSIONS, PERMISSIONS, SYSTEM_ROLES, SYSTEM_ROLE_PERMISSIONS } from './permissions';

describe('izin kataloğu', () => {
  it('kodlar benzersiz', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
  });

  it('her kod resource.action biçiminde', () => {
    for (const code of ALL_PERMISSIONS) {
      expect(code).toMatch(/^[a-z][a-z-]*\.[a-z][a-z.-]*$/);
    }
  });
});

describe('sistem rolleri', () => {
  it('her rolün izinleri katalogda tanımlı', () => {
    for (const [role, codes] of Object.entries(SYSTEM_ROLE_PERMISSIONS)) {
      for (const code of codes) {
        expect(ALL_PERMISSIONS, `${role} rolündeki ${code} katalogda yok`).toContain(code);
      }
    }
  });

  it('Patron tüm izinlere sahip', () => {
    expect(SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.OWNER]).toHaveLength(ALL_PERMISSIONS.length);
  });

  it('Kasiyer maliyet ve kâr göremez, ürün silemez', () => {
    const cashier = SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.CASHIER];
    expect(cashier).not.toContain(PERMISSIONS.PRODUCT_COST_VIEW);
    expect(cashier).not.toContain(PERMISSIONS.REPORT_PROFIT_VIEW);
    expect(cashier).not.toContain(PERMISSIONS.PRODUCT_DELETE);
  });

  it('Yönetici kullanıcı ve abonelik yönetemez', () => {
    const manager = SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES.MANAGER];
    expect(manager).not.toContain(PERMISSIONS.USER_MANAGE);
    expect(manager).not.toContain(PERMISSIONS.ROLE_MANAGE);
    expect(manager).not.toContain(PERMISSIONS.SUBSCRIPTION_MANAGE);
  });
});
