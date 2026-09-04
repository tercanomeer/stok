import type { CashSession, PosConfig, PosSession } from '@shared/ipc-contracts';
import { describe, expect, it } from 'vitest';


import { resolveStep, type BootState } from './boot-flow';

const CONFIG: PosConfig = {
  serverUrl: 'https://api.test',
  registerId: 'r1',
  registerName: 'Kasa 1',
  offlineGraceDays: 7,
  lastEmail: 'kasiyer@stokk.test',
};

const SESSION: PosSession = {
  user: {
    id: 'u1',
    tenantId: 't1',
    email: 'kasiyer@stokk.test',
    fullName: 'Ayşe Kasiyer',
    permissions: ['sale.create'],
    roles: ['KASIYER'],
  },
  offline: false,
  lastOnlineLoginAt: '2026-09-03T10:00:00.000Z',
};

const SHIFT: CashSession = {
  id: 'cs1',
  registerId: 'r1',
  status: 'OPEN',
  openingAmount: '250.00',
  openedAt: '2026-09-03T06:00:00.000Z',
};

function state(overrides: Partial<BootState> = {}): BootState {
  return {
    loading: false,
    config: CONFIG,
    session: SESSION,
    shift: SHIFT,
    shiftLoading: false,
    editingServer: false,
    editingRegister: false,
    ...overrides,
  };
}

describe('açılış akışı', () => {
  it('yükleniyorsa splash', () => {
    expect(resolveStep(state({ loading: true }))).toBe('loading');
    expect(resolveStep(state({ config: null }))).toBe('loading');
  });

  it('sunucu adresi yoksa kurulum', () => {
    expect(resolveStep(state({ config: { ...CONFIG, serverUrl: null } }))).toBe('server-setup');
  });

  it('oturum yoksa giriş', () => {
    expect(resolveStep(state({ session: null }))).toBe('login');
  });

  it('kasa seçilmemişse kasa seçimi', () => {
    expect(resolveStep(state({ config: { ...CONFIG, registerId: null } }))).toBe('register-select');
  });

  it('açık vardiya yoksa vardiya açılışı', () => {
    expect(resolveStep(state({ shift: null }))).toBe('shift-open');
  });

  it('vardiya sorgusu sürerken form GÖSTERİLMEZ', () => {
    expect(resolveStep(state({ shift: null, shiftLoading: true }))).toBe('loading');
  });

  it('hepsi hazırsa satışa hazır', () => {
    expect(resolveStep(state())).toBe('ready');
  });

  it('kullanıcı sunucuyu değiştirmek isterse akış başa döner', () => {
    expect(resolveStep(state({ editingServer: true }))).toBe('server-setup');
  });

  it('kasa değiştirme isteği vardiyanın önüne geçer', () => {
    expect(resolveStep(state({ editingRegister: true }))).toBe('register-select');
  });

  it('sunucu adresi yoksa oturum olsa bile kurulum önce gelir', () => {
    expect(resolveStep(state({ config: { ...CONFIG, serverUrl: null }, session: SESSION }))).toBe(
      'server-setup',
    );
  });
});
