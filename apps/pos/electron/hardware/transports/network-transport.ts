import net from 'node:net';

import { DeviceError, toDeviceError } from '../device-error';
import type { NetworkTransportConfig, Transport } from '../transport';

/** Ağ yazıcısı açılırken beklenecek süre. Kasiyer fişi saniyelerce bekleyemez. */
const CONNECT_TIMEOUT_MS = 4_000;

/**
 * Yazma için üst sınır.
 *
 * Bağlantı kurulduktan sonra zaman aşımı kapatılırsa, veriyi hiç okumayan bir
 * cihaz (TCP penceresi dolar, `write` geri çağrısı hiç gelmez) yazdırma zincirini
 * SONSUZA DEK kilitler ve ondan sonraki bütün fişler de basılamaz. Yazma bu
 * yüzden kendi süresini taşır.
 */
const WRITE_TIMEOUT_MS = 8_000;

/**
 * Ağ (TCP) bağlantısı — ESC/POS yazıcılarda standart RAW portu 9100.
 *
 * Bağlantı KOMUT BAŞINA açılıp kapanır. Kalıcı soket tutmak, yazıcı yeniden
 * başlatıldığında (ya da ağ bir an koptuğunda) ölü bir soketle "yazdım" demeye
 * yol açardı; fişin basılmadığını kasiyer ancak kağıda bakınca anlardı.
 */
export function openNetworkTransport(config: NetworkTransportConfig): Promise<Transport> {
  return new Promise<Transport>((resolve, reject) => {
    const socket = new net.Socket();
    const chunks: Buffer[] = [];
    let settled = false;

    const fail = (error: unknown): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(toDeviceError(error, 'DEVICE_UNREACHABLE'));
    };

    socket.setTimeout(CONNECT_TIMEOUT_MS);
    socket.once('timeout', () => {
      fail(new DeviceError('DEVICE_TIMEOUT', `${config.host}:${String(config.port)} zaman aşımı`));
    });
    socket.once('error', fail);

    socket.on('data', (chunk: Buffer) => chunks.push(chunk));

    socket.connect(config.port, config.host, () => {
      if (settled) return;
      settled = true;
      // Bağlantı kuruldu: bundan sonra zaman aşımı okuma tarafında yönetiliyor.
      socket.setTimeout(0);
      // `fail` artık erken çıkıyor (settled). Bağlantı sonrası bir hata (yazıcı
      // kapandı, ECONNRESET) sessizce yutulmasın diye soket hemen düşürülür;
      // süren yazma/okuma zaman aşımını beklemeden hata alır.
      socket.on('error', () => {
        socket.destroy();
      });

      resolve({
        write: (data) =>
          new Promise<void>((done, failWrite) => {
            const timer = setTimeout(() => {
              socket.destroy();
              failWrite(new DeviceError('DEVICE_TIMEOUT', 'yazıcı veriyi almadı'));
            }, WRITE_TIMEOUT_MS);
            socket.write(data, (error) => {
              clearTimeout(timer);
              if (error) failWrite(toDeviceError(error, 'DEVICE_UNREACHABLE'));
              else done();
            });
          }),
        read: ({ timeoutMs, isComplete }) =>
          new Promise<Buffer>((done, failRead) => {
            const check = (): boolean => {
              const buffer = Buffer.concat(chunks);
              if (!isComplete(buffer)) return false;
              clearTimeout(timer);
              socket.off('data', onData);
              // Tampon boşaltılır: aynı bağlantıda ikinci bir okuma eski baytları
              // görmesin (durum sorgusu + veri okuma aynı sokette olabiliyor).
              chunks.length = 0;
              done(buffer);
              return true;
            };
            const timer = setTimeout(() => {
              socket.off('data', onData);
              chunks.length = 0;
              failRead(new DeviceError('DEVICE_TIMEOUT', 'ağ cihazı yanıt vermedi'));
            }, timeoutMs);
            const onData = (): void => void check();
            socket.on('data', onData);
            // Bağlantı açılırken gelmiş olabilecek veri de değerlendirilir.
            check();
          }),
        close: () =>
          new Promise<void>((done) => {
            socket.end(() => {
              socket.destroy();
              done();
            });
          }),
      });
    });
  });
}
