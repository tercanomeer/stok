import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from './password';

describe('yerel parola özeti', () => {
  it('doğru parolayı doğrular', () => {
    const hash = hashPassword('Kasa!2026');
    expect(verifyPassword('Kasa!2026', hash)).toBe(true);
  });

  it('yanlış parolayı reddeder', () => {
    const hash = hashPassword('Kasa!2026');
    expect(verifyPassword('kasa!2026', hash)).toBe(false);
  });

  it('parolanın kendisini SAKLAMAZ', () => {
    const hash = hashPassword('Kasa!2026');
    expect(hash).not.toContain('Kasa!2026');
  });

  it('aynı parola her seferinde farklı özet üretir (tuz)', () => {
    expect(hashPassword('aynı')).not.toBe(hashPassword('aynı'));
  });

  it('bozuk özet karşısında çökmez, false döner', () => {
    expect(verifyPassword('x', 'bozuk')).toBe(false);
    expect(verifyPassword('x', 'scrypt$1$2$3$$')).toBe(false);
  });

  it('özete elle yazılmış aşırı maliyeti reddeder', () => {
    // Config/DB dosyasına erişen biri N'i şişirip her girişte gigabaytlarca
    // bellek ayırtabilirdi; sınır dışı parametre türetmeye hiç girmez.
    const [, , r, p, salt, hash] = hashPassword('Kasa!2026').split('$');
    const tampered = ['scrypt', String(1 << 25), r, p, salt, hash].join('$');
    expect(verifyPassword('Kasa!2026', tampered)).toBe(false);
  });

  it('maliyet parametresi özetin içinde taşınır', () => {
    expect(hashPassword('Kasa!2026').split('$')[1]).toBe('131072');
  });
});
