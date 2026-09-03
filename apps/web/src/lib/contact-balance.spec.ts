import { describe, expect, it } from 'vitest';

import type { Contact } from './api-types';
import { balanceView, creditUsageRatio, isOverCreditLimit } from './contact-balance';

function contact(overrides: Partial<Contact>): Contact {
  return {
    id: 'c1',
    type: 'CUSTOMER',
    name: 'Test Cari',
    code: null,
    taxNumber: null,
    taxOffice: null,
    phone: null,
    email: null,
    address: null,
    creditLimit: '0',
    balance: '0',
    isActive: true,
    createdAt: '2026-09-03T00:00:00.000Z',
    ...overrides,
  };
}

describe('balanceView', () => {
  it('pozitif bakiye = cari bize borçlu, tutar işaretsiz gösterilir', () => {
    const view = balanceView('1250.00');
    expect(view.direction).toBe('receivable');
    expect(view.amount).toBe('1250.00');
    expect(view.label).toBe('Bize borçlu');
  });

  it('negatif bakiye = biz borçluyuz, eksi işareti gösterime taşınmaz', () => {
    const view = balanceView('-480.50');
    expect(view.direction).toBe('payable');
    expect(view.amount).toBe('480.50');
    expect(view.label).toBe('Biz borçluyuz');
  });

  it('sıfır bakiye kapalı hesaptır', () => {
    expect(balanceView('0').direction).toBe('settled');
    expect(balanceView('0.00').direction).toBe('settled');
  });

  it('bozuk değer hesabı kapalı sayar, çökmez', () => {
    expect(balanceView('').direction).toBe('settled');
  });
});

describe('isOverCreditLimit', () => {
  it('limit aşılmışsa true', () => {
    expect(isOverCreditLimit(contact({ creditLimit: '1000', balance: '1500' }))).toBe(true);
  });

  it('limitte veya altındaysa false', () => {
    expect(isOverCreditLimit(contact({ creditLimit: '1000', balance: '1000' }))).toBe(false);
    expect(isOverCreditLimit(contact({ creditLimit: '1000', balance: '250' }))).toBe(false);
  });

  it('limit 0 ise "limit yok" demektir, aşım olmaz', () => {
    expect(isOverCreditLimit(contact({ creditLimit: '0', balance: '9999' }))).toBe(false);
  });

  it('biz borçluysak limit aşımı olmaz', () => {
    expect(isOverCreditLimit(contact({ creditLimit: '1000', balance: '-5000' }))).toBe(false);
  });
});

describe('creditUsageRatio', () => {
  it('limitsiz caride null döner', () => {
    expect(creditUsageRatio(contact({ creditLimit: '0' }))).toBeNull();
  });

  it('borçsuz caride sıfır', () => {
    expect(creditUsageRatio(contact({ creditLimit: '1000', balance: '-20' }))).toBe(0);
  });

  it('kullanım oranını verir', () => {
    expect(creditUsageRatio(contact({ creditLimit: '1000', balance: '750' }))).toBeCloseTo(0.75);
  });
});
