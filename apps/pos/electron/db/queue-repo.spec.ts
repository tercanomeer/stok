import { beforeEach, describe, expect, it } from 'vitest';

import { openDatabase, type PosDatabase } from './database';
import {
  claimDue,
  counts,
  enqueue,
  listFailed,
  markRetry,
  markSynced,
  requeueFailed,
} from './queue-repo';

const NOW = new Date('2026-09-03T10:00:00.000Z');

describe('gönderim kuyruğu', () => {
  let db: PosDatabase;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  it('aynı satışı İKİNCİ kez kuyruğa almaz', () => {
    expect(enqueue(db, { entity: 'sale', entityId: 's1', payload: { a: 1 }, now: NOW })).toBe(true);
    expect(enqueue(db, { entity: 'sale', entityId: 's1', payload: { a: 1 }, now: NOW })).toBe(
      false,
    );
    expect(counts(db)).toEqual({ pending: 1, failed: 0 });
  });

  it('yalnız bekleme süresi dolmuş kayıtları verir', () => {
    enqueue(db, { entity: 'sale', entityId: 's1', payload: {}, now: NOW });
    expect(claimDue(db, NOW, 10)).toHaveLength(1);

    markRetry(db, { id: 1, attempts: 0, error: 'ağ yok', now: NOW, random: () => 0.5 });
    // 5 sn ötelendi: hemen sonra alınmaz, süre dolunca alınır.
    expect(claimDue(db, NOW, 10)).toHaveLength(0);
    expect(claimDue(db, new Date(NOW.getTime() + 6_000), 10)).toHaveLength(1);
  });

  it('5. denemeden sonra kalıcı hata kuyruğuna düşer ve döngü onu almaz', () => {
    enqueue(db, { entity: 'sale', entityId: 's1', payload: {}, now: NOW });

    let exhausted = false;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      exhausted = markRetry(db, {
        id: 1,
        attempts: attempt,
        error: 'sunucu hatası',
        now: NOW,
        random: () => 0.5,
      });
    }

    expect(exhausted).toBe(true);
    expect(counts(db)).toEqual({ pending: 0, failed: 1 });
    expect(claimDue(db, new Date(NOW.getTime() + 86_400_000), 10)).toHaveLength(0);
  });

  it('başarılı gönderim kaydı kuyruktan düşürür', () => {
    enqueue(db, { entity: 'sale', entityId: 's1', payload: {}, now: NOW });
    markSynced(db, [1], NOW);
    expect(counts(db)).toEqual({ pending: 0, failed: 0 });
    expect(claimDue(db, NOW, 10)).toHaveLength(0);
  });

  it('elle tekrar deneme sayacı sıfırlar ve kayıtları geri alır', () => {
    enqueue(db, { entity: 'sale', entityId: 's1', payload: {}, now: NOW });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      markRetry(db, { id: 1, attempts: attempt, error: 'x', now: NOW, random: () => 0.5 });
    }
    expect(listFailed(db)).toHaveLength(1);

    expect(requeueFailed(db, NOW).valueOf()).toBe(1);
    expect(counts(db)).toEqual({ pending: 1, failed: 0 });
    expect(claimDue(db, NOW, 10)).toHaveLength(1);
  });
});
