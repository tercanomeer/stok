import { isConfigured, type DeviceConfig } from './device-config';
import { DeviceError, toDeviceError } from './device-error';
import { isCompleteReading, parseWeight } from './scale-protocol';
import type { TransportOpener } from './transport';
import type { ScaleWeight } from '../shared/ipc-contracts';

/**
 * Terazi bir tartımı bu süre içinde göndermezse pes edilir.
 *
 * Sürekli yayın yapan modellerde ilk satır milisaniyeler içinde gelir; komutla
 * çalışan modellerde birkaç yüz milisaniye sürebilir. Kasiyer terazinin başında
 * bekliyor, 2 saniyeden uzun bir sessizlik "bozuk" demektir.
 */
const READ_TIMEOUT_MS = 2_000;

export interface ScaleDeps {
  openTransport: TransportOpener;
  getConfig: () => DeviceConfig;
}

/**
 * Tartı okuma.
 *
 * Terazi tek yönlü yayın yapar (çoğu model) ya da komutla yanıt verir; ikisinde de
 * yapılan iş aynı: portu aç, bir satır oku, ayrıştır, kapat. Port okuma bitince
 * KAPANIR — açık tutmak, terazinin kendi yazılımının porta erişememesi demek.
 */
export class ScaleService {
  constructor(private readonly deps: ScaleDeps) {}

  get configured(): boolean {
    return isConfigured(this.deps.getConfig().scale.transport);
  }

  async read(): Promise<ScaleWeight> {
    const config = this.deps.getConfig().scale;
    if (!isConfigured(config.transport)) throw new DeviceError('DEVICE_NOT_CONFIGURED');

    const transport = await this.deps.openTransport(config.transport);
    try {
      const buffer = await transport.read({
        timeoutMs: READ_TIMEOUT_MS,
        isComplete: isCompleteReading,
      });
      // Terazi çıktısı saf ASCII; kod sayfası dönüşümü YOK (latin1 = bayt eşleme).
      const raw = buffer.toString('latin1');
      const reading = parseWeight(raw, config.protocol);
      if (!reading) {
        throw new DeviceError(
          'DEVICE_PROTOCOL',
          `ayrıştırılamayan tartı çıktısı: ${JSON.stringify(raw.slice(0, 120))}`,
        );
      }
      // Negatif ağırlık gerçek bir arızadır (dara alınmamış, ters basılmış):
      // sıfıra yuvarlayıp geçmek kasiyere sorunu gizlerdi.
      if (Number(reading.weightKg) < 0) {
        throw new DeviceError(
          'DEVICE_NOT_READY',
          `negatif tartım: ${reading.weightKg}`,
          'Terazi eksi değer gösteriyor. Tartıyı boşaltıp darasını alın.',
        );
      }
      return {
        weightKg: reading.weightKg,
        stable: reading.stable,
        protocol: reading.protocol,
      };
    } catch (error) {
      // Fallback BAĞLANTI hatasıdır, protokol değil: "ayrıştırılamayan çıktı"
      // durumu yukarıda kendi `DEVICE_PROTOCOL` hatasını fırlatıyor. Tanınmayan
      // sürücü hatasını protokole yormak kasiyeri yanlış ayara yönlendirirdi.
      throw toDeviceError(error, 'DEVICE_UNREACHABLE');
    } finally {
      await transport.close().catch(() => undefined);
    }
  }
}
