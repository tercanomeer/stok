import { describe, expect, it, vi } from 'vitest';

import { NetworkMonitor } from './network-monitor';

const NOW = new Date('2026-09-03T10:00:00.000Z');

describe('NetworkMonitor', () => {
  it('sunucu yanıt verirse çevrimiçi', async () => {
    const monitor = new NetworkMonitor({
      probe: () => Promise.resolve(true),
      isOnline: () => true,
      clock: () => NOW,
    });

    const status = await monitor.check();
    expect(status.state).toBe('online');
    expect(status.lastOkAt).toBe(NOW.toISOString());
    expect(monitor.isOnline).toBe(true);
  });

  it('internet var ama sunucu yoksa "unreachable" — çevrimdışıyla aynı şey değil', async () => {
    const monitor = new NetworkMonitor({
      probe: () => Promise.resolve(false),
      isOnline: () => true,
      clock: () => NOW,
    });

    expect((await monitor.check()).state).toBe('unreachable');
    expect(monitor.isOnline).toBe(false);
  });

  it('işletim sistemi bağlantı yok diyorsa yoklama yapılmaz', async () => {
    const probe = vi.fn().mockResolvedValue(true);
    const monitor = new NetworkMonitor({
      probe,
      isOnline: () => false,
      clock: () => NOW,
    });

    expect((await monitor.check()).state).toBe('offline');
    expect(probe).not.toHaveBeenCalled();
  });

  it('yalnız durum DEĞİŞTİĞİNDE haber verir', async () => {
    let online = false;
    const listener = vi.fn();
    const monitor = new NetworkMonitor({
      probe: () => Promise.resolve(online),
      isOnline: () => true,
      clock: () => NOW,
    });
    monitor.onChange(listener);

    await monitor.check();
    await monitor.check();
    expect(listener).toHaveBeenCalledTimes(1);

    online = true;
    await monitor.check();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'online' }));
  });

  it('yavaş yoklama sırasında ikinci yoklama başlatılmaz', async () => {
    const pending: ((value: boolean) => void)[] = [];
    const probe = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          pending.push(resolve);
        }),
    );
    const monitor = new NetworkMonitor({ probe, isOnline: () => true, clock: () => NOW });

    const first = monitor.check();
    await monitor.check();
    expect(probe).toHaveBeenCalledTimes(1);

    pending[0]?.(true);
    await first;
  });
});
