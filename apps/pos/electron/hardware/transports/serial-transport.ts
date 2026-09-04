import { SerialPort } from 'serialport';

import { DeviceError, toDeviceError } from '../device-error';
import type { SerialTransportConfig, Transport } from '../transport';

/**
 * Yazma + `drain` için üst sınır.
 *
 * Sürücü geri çağrıyı hiç çağırmazsa (takılı kalan USB-seri çevirici) yazdırma
 * zinciri sonsuza dek kilitlenir ve sonraki bütün fişler de basılamaz.
 */
const WRITE_TIMEOUT_MS = 8_000;

/** Kasa PC'sinde görünen seri portlar — ayarlar ekranı listeyi buradan doldurur. */
export interface SerialPortInfo {
  path: string;
  /** Cihazın kendini tanıttığı ad; boş olabilir (ucuz USB-seri çeviriciler). */
  manufacturer: string | null;
  friendlyName: string | null;
}

export async function listSerialPorts(): Promise<SerialPortInfo[]> {
  try {
    const ports = await SerialPort.list();
    return ports.map((port) => ({
      path: port.path,
      manufacturer: port.manufacturer ?? null,
      friendlyName: (port as { friendlyName?: string }).friendlyName ?? null,
    }));
  } catch (error) {
    throw toDeviceError(error, 'DEVICE_UNREACHABLE');
  }
}

/**
 * Seri port bağlantısı (USB-seri çeviriciler dahil).
 *
 * Port KOMUT BAŞINA açılıp kapanır: Windows'ta bir COM portunu açık tutmak, kasa
 * uygulaması kapanmadan başka bir programın (yazıcı test aracı, terazi yazılımı)
 * o porta erişememesi demek. Ayrıca kablo çıkıp takıldığında kalıcı bir tutamaç
 * ölü kalır ve "yazdım" der.
 */
export function openSerialTransport(config: SerialTransportConfig): Promise<Transport> {
  return new Promise<Transport>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const port = new SerialPort(
      { path: config.path, baudRate: config.baudRate, autoOpen: false },
      // `autoOpen: false` ile bu geri çağrı kullanılmıyor; açılış aşağıda.
    );

    port.on('data', (chunk: Buffer) => chunks.push(chunk));

    port.open((error) => {
      if (error) {
        reject(toDeviceError(error, 'DEVICE_UNREACHABLE'));
        return;
      }

      resolve({
        write: (data) =>
          new Promise<void>((done, failWrite) => {
            const timer = setTimeout(() => {
              failWrite(new DeviceError('DEVICE_TIMEOUT', `${config.path} veriyi almadı`));
            }, WRITE_TIMEOUT_MS);
            port.write(data, (writeError) => {
              if (writeError) {
                clearTimeout(timer);
                failWrite(toDeviceError(writeError, 'DEVICE_UNREACHABLE'));
                return;
              }
              // `drain` olmadan port hemen kapatılırsa baytlar yola çıkmadan düşer.
              port.drain((drainError) => {
                clearTimeout(timer);
                if (drainError) failWrite(toDeviceError(drainError, 'DEVICE_UNREACHABLE'));
                else done();
              });
            });
          }),
        read: ({ timeoutMs, isComplete }) =>
          new Promise<Buffer>((done, failRead) => {
            const check = (): void => {
              const buffer = Buffer.concat(chunks);
              if (!isComplete(buffer)) return;
              clearTimeout(timer);
              port.off('data', onData);
              // Tampon boşaltılır: aynı bağlantıda ikinci bir okuma yapılırsa
              // (ör. durum sorgusu + tartım) eski baytlar yeni okumayı kirletirdi.
              chunks.length = 0;
              done(buffer);
            };
            const timer = setTimeout(() => {
              port.off('data', onData);
              chunks.length = 0;
              failRead(new DeviceError('DEVICE_TIMEOUT', `${config.path} yanıt vermedi`));
            }, timeoutMs);
            const onData = (): void => {
              check();
            };
            port.on('data', onData);
            check();
          }),
        close: () =>
          new Promise<void>((done) => {
            if (!port.isOpen) {
              done();
              return;
            }
            port.close(() => {
              done();
            });
          }),
      });
    });
  });
}
