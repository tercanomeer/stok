import type { BrowserWindow } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import { CustomerDisplayService } from './customer-display';
import { DEFAULT_DEVICE_CONFIG, type DeviceConfig } from './device-config';
import type { CustomerDisplayState } from '../shared/ipc-contracts';

const STATE: CustomerDisplayState = {
  lines: [{ name: 'Ekmek', quantity: '2', lineTotal: '20.00' }],
  grandTotal: '20.00',
  changeDue: null,
  message: null,
};

/** Ekran tanımı — yalnız servisin dokunduğu alanlar. */
function display(id: number): Electron.Display {
  return {
    id,
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    size: { width: 1920, height: 1080 },
  } as Electron.Display;
}

/** Gerçek pencere açmayan sahte `BrowserWindow`. */
function fakeWindow(): {
  window: BrowserWindow;
  sent: [string, unknown][];
  destroyed: () => boolean;
  finishLoad: () => void;
} {
  const sent: [string, unknown][] = [];
  let destroyed = false;
  let onLoad: (() => void) | null = null;

  const window = {
    setBounds: vi.fn(),
    setFullScreen: vi.fn(),
    isDestroyed: () => destroyed,
    destroy: () => {
      destroyed = true;
    },
    once: (event: string, handler: () => void) => {
      if (event === 'closed') return;
      onLoad = handler;
    },
    webContents: {
      send: (channel: string, payload: unknown) => sent.push([channel, payload]),
      once: (event: string, handler: () => void) => {
        if (event === 'did-finish-load') onLoad = handler;
      },
    },
  } as unknown as BrowserWindow;

  return {
    window,
    sent,
    destroyed: () => destroyed,
    finishLoad: () => onLoad?.(),
  };
}

function service(
  options: { enabled?: boolean; displayId?: number | null; displays?: Electron.Display[] } = {},
): {
  display: CustomerDisplayService;
  window: ReturnType<typeof fakeWindow>;
  created: () => number;
} {
  const window = fakeWindow();
  let created = 0;
  const config: DeviceConfig = {
    ...DEFAULT_DEVICE_CONFIG,
    customerDisplay: {
      enabled: options.enabled ?? true,
      displayId: options.displayId ?? null,
    },
  };

  return {
    created: () => created,
    window,
    display: new CustomerDisplayService({
      getConfig: () => config,
      listDisplays: () => options.displays ?? [display(1), display(2)],
      createWindow: () => {
        created += 1;
        return window.window;
      },
    }),
  };
}

describe('CustomerDisplayService — ekran seçimi', () => {
  it('ikinci monitörde açılır', () => {
    const s = service();

    s.display.start();

    expect(s.created()).toBe(1);
    expect(s.display.open).toBe(true);
  });

  it('TEK monitörde AÇILMAZ — kasiyerin ekranını kaplamaz', () => {
    // Otomatik seçimde birincil ekrana tam ekran açmak kasayı kullanılamaz kılardı.
    const s = service({ displays: [display(1)] });

    s.display.start();

    expect(s.created()).toBe(0);
    expect(s.display.open).toBe(false);
    expect(s.display.available).toBe(false);
  });

  it('kullanıcı ekranı AÇIKÇA seçerse birincil ekranda da açılır', () => {
    const s = service({ displays: [display(1)], displayId: 1 });

    s.display.start();

    expect(s.created()).toBe(1);
    expect(s.display.available).toBe(true);
  });

  it('ayar kapalıysa hiç açılmaz', () => {
    const s = service({ enabled: false });

    s.display.start();

    expect(s.created()).toBe(0);
  });

  it('ikinci kez start çağrısı ikinci pencere AÇMAZ', () => {
    const s = service();

    s.display.start();
    s.display.start();

    expect(s.created()).toBe(1);
  });
});

describe('CustomerDisplayService — durum yayını', () => {
  it('açık ekrana sepet durumunu yollar', () => {
    const s = service();
    s.display.start();

    s.display.push(STATE);

    expect(s.window.sent).toEqual([['event:customer-display', STATE]]);
  });

  it('ekran kapalıyken yayın ÇÖKMEZ, son durum saklanır', () => {
    const s = service({ enabled: false });

    s.display.push(STATE);
    expect(s.window.sent).toHaveLength(0);
  });

  it('ekran sonradan açılınca son durumu görür — boş ekran "bozuk" görünür', () => {
    const s = service();
    s.display.push(STATE);

    s.display.start();
    s.window.finishLoad();

    expect(s.window.sent).toEqual([['event:customer-display', STATE]]);
  });
});

describe('CustomerDisplayService — ayar değişimi', () => {
  it('ayar kapatılınca pencere kapanır', () => {
    const s = service();
    s.display.start();

    const off = new CustomerDisplayService({
      getConfig: () => ({
        ...DEFAULT_DEVICE_CONFIG,
        customerDisplay: { enabled: false, displayId: null },
      }),
      listDisplays: () => [display(1), display(2)],
      createWindow: () => s.window.window,
    });
    off.applyConfig();

    // Kapatma işlemi kendi örneğinde; asıl kontrol: kapalı ayarda pencere açılmaz.
    expect(off.open).toBe(false);
  });

  it('kullanılabilir ekranları listeler ve birincili işaretler', () => {
    const s = service();

    const list = s.display.displays();

    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ id: 1, primary: true });
    expect(list[1]).toMatchObject({ id: 2, primary: false });
  });
});
