import { describe, expect, it } from 'vitest';

import { DEFAULT_DEVICE_CONFIG, type DeviceConfig } from './device-config';
import { DeviceError } from './device-error';
import { ScaleService } from './scale-service';
import type { Transport } from './transport';

/** Verilen metni tek parça olarak sunan sahte terazi. */
function fakeScale(output: string | Error): { transport: Transport; closed: () => number } {
  let closed = 0;
  return {
    closed: () => closed,
    transport: {
      write: () => Promise.resolve(),
      read: () =>
        output instanceof Error ? Promise.reject(output) : Promise.resolve(Buffer.from(output)),
      close: () => {
        closed += 1;
        return Promise.resolve();
      },
    },
  };
}

function service(
  output: string | Error,
  protocol: DeviceConfig['scale']['protocol'] = 'auto',
): { scale: ScaleService; closed: () => number } {
  const fake = fakeScale(output);
  const scale = new ScaleService({
    getConfig: () => ({
      ...DEFAULT_DEVICE_CONFIG,
      scale: { transport: { kind: 'serial', path: 'COM3', baudRate: 9600 }, protocol },
    }),
    openTransport: () => Promise.resolve(fake.transport),
  });
  return { scale, closed: fake.closed };
}

describe('ScaleService', () => {
  it('tartımı okur ve portu KAPATIR', async () => {
    const { scale, closed } = service('ST,GS,   1.234 kg\r\n');

    await expect(scale.read()).resolves.toEqual({
      weightKg: '1.234',
      stable: true,
      protocol: 'cas',
    });
    // Port açık kalırsa terazinin kendi yazılımı o porta erişemez.
    expect(closed()).toBe(1);
  });

  it('terazi tanımsızsa açık hata verir', async () => {
    const scale = new ScaleService({
      getConfig: () => DEFAULT_DEVICE_CONFIG,
      openTransport: () => Promise.reject(new Error('açılmamalıydı')),
    });

    await expect(scale.read()).rejects.toMatchObject({ code: 'DEVICE_NOT_CONFIGURED' });
  });

  it('anlaşılmayan çıktı protokol hatası verir ve portu kapatır', async () => {
    const { scale, closed } = service('BOZUK VERI\r\n');

    await expect(scale.read()).rejects.toMatchObject({ code: 'DEVICE_PROTOCOL' });
    expect(closed()).toBe(1);
  });

  it('zaman aşımı kasiyere anlaşılır mesajla döner', async () => {
    const { scale } = service(new DeviceError('DEVICE_TIMEOUT', 'COM3 yanıt vermedi'));

    await expect(scale.read()).rejects.toMatchObject({ code: 'DEVICE_TIMEOUT' });
    await expect(scale.read()).rejects.toThrow(/yanıt vermedi/);
  });

  it('bağlantı hatası PROTOKOL hatası sanılmaz', async () => {
    // Kablo koptuğunda kasiyeri "cihaz türünü kontrol edin" diye ayarlara
    // yönlendirmek yanlış yola sokardı.
    const { scale } = service(new Error('read ECONNRESET'));

    await expect(scale.read()).rejects.toMatchObject({ code: 'DEVICE_UNREACHABLE' });
  });

  it('sürücü hatası ham metinle değil Türkçe mesajla döner', async () => {
    const { scale } = service(new Error('Error: ENOENT: no such file or directory, open COM9'));

    const error = await scale.read().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DeviceError);
    expect((error as DeviceError).message).not.toContain('ENOENT');
    expect((error as DeviceError).message).toContain('ulaşılamıyor');
  });

  it('protokol elle seçilirse yalnız o kalıp denenir', async () => {
    // CAS çerçevesi, ama ayar Toledo diyor: yanlış eşleşme yerine hata.
    const { scale } = service('ST,GS,   1.234 kg\r\n', 'toledo');
    await expect(scale.read()).rejects.toMatchObject({ code: 'DEVICE_PROTOCOL' });
  });

  it('negatif tartım REDDEDİLİR — dara arızası gizlenmez', async () => {
    const { scale } = service('ST,GS, -1.500 kg\r\n');

    await expect(scale.read()).rejects.toMatchObject({ code: 'DEVICE_NOT_READY' });
    await expect(scale.read()).rejects.toThrow(/darasını alın/);
  });

  it('kararsız tartım da döner — karar çağırana ait', async () => {
    // Servis "oturmadı" diye hata vermez; satış ekranı kasiyere söyleyip bekletir.
    const { scale } = service('US,GS,   1.234 kg\r\n');
    await expect(scale.read()).resolves.toMatchObject({ stable: false });
  });
});
