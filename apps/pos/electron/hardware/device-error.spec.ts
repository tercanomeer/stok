import { describe, expect, it } from 'vitest';

import { DeviceError, toDeviceError } from './device-error';

describe('DeviceError', () => {
  it('her kod için kasiyerin anlayacağı bir cümle var', () => {
    expect(new DeviceError('DEVICE_NOT_CONFIGURED').message).toContain('Ayarlar');
    expect(new DeviceError('DEVICE_UNREACHABLE').message).toContain('Kabloyu');
    expect(new DeviceError('DEVICE_NOT_READY').message).toContain('Kağıdı');
  });

  it('ham sürücü metni MESAJA girmez', () => {
    const error = new DeviceError('DEVICE_UNREACHABLE', 'Error: ECONNREFUSED 10.0.0.5:9100');

    expect(error.message).not.toContain('ECONNREFUSED');
    // Ayrıntı log için nesnenin üzerinde duruyor.
    expect(error.detail).toContain('ECONNREFUSED');
  });
});

describe('toDeviceError', () => {
  it('bilinen sürücü hatalarını doğru koda çevirir', () => {
    expect(toDeviceError(new Error('connect ECONNREFUSED'), 'DEVICE_PROTOCOL').code).toBe(
      'DEVICE_UNREACHABLE',
    );
    expect(toDeviceError(new Error('ENOENT: no such file'), 'DEVICE_PROTOCOL').code).toBe(
      'DEVICE_UNREACHABLE',
    );
    expect(toDeviceError(new Error('operation timed out'), 'DEVICE_PROTOCOL').code).toBe(
      'DEVICE_TIMEOUT',
    );
  });

  it('erişim reddi için ayrı bir açıklama verir — portu başka program tutuyor olabilir', () => {
    const error = toDeviceError(new Error('EACCES: permission denied'), 'DEVICE_PROTOCOL');

    expect(error.code).toBe('DEVICE_UNREACHABLE');
    expect(error.message).toContain('başka bir program');
  });

  it('tanınmayan hata verilen varsayılan koda düşer', () => {
    expect(toDeviceError(new Error('acayip bir şey'), 'DEVICE_PROTOCOL').code).toBe(
      'DEVICE_PROTOCOL',
    );
  });

  it('zaten DeviceError olanı OLDUĞU GİBİ bırakır', () => {
    const original = new DeviceError('DEVICE_NOT_READY');
    expect(toDeviceError(original, 'DEVICE_PROTOCOL')).toBe(original);
  });

  it('Error olmayan değerleri de yutar', () => {
    expect(toDeviceError('düz metin', 'DEVICE_PROTOCOL')).toBeInstanceOf(DeviceError);
  });
});
