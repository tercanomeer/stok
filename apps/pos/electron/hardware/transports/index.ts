import { DeviceError } from '../device-error';
import type { Transport, TransportConfig, TransportOpener } from '../transport';
import { openNetworkTransport } from './network-transport';
import { openSerialTransport } from './serial-transport';

/**
 * Yapılandırmaya göre bağlantıyı açan TEK yer.
 *
 * Yeni bir bağlantı türü (Bluetooth, Windows yazıcı kuyruğu) eklendiğinde
 * değişmesi gereken tek dosya burasıdır; protokol kodu (ESC/POS, tartı) ve
 * servisler `Transport` arayüzünü gördüğü için dokunulmaz.
 */
export const openTransport: TransportOpener = async (
  config: TransportConfig,
): Promise<Transport> => {
  switch (config.kind) {
    case 'serial':
      return openSerialTransport(config);
    case 'network':
      return openNetworkTransport(config);
    case 'none':
      throw new DeviceError('DEVICE_NOT_CONFIGURED');
  }
};

export { listSerialPorts, type SerialPortInfo } from './serial-transport';
