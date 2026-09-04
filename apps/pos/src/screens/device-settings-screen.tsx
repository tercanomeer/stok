import type {
  DeviceSettings,
  DeviceTransport,
  DisplayOption,
  SerialPortOption,
} from '@shared/ipc-contracts';
import { useCallback, useEffect, useState, type ReactElement } from 'react';

import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Checkbox,
  Field,
  Input,
  Select,
  Spinner,
  useToast,
} from '@stokk/ui';


import { bridge, errorMessage, unwrap } from '../lib/bridge';

interface DeviceSettingsScreenProps {
  onClose: () => void;
}

/** Yazıcı ve terazi için ortak bağlantı biçimi seçimi. */
function TransportFields({
  value,
  ports,
  onChange,
}: {
  value: DeviceTransport;
  ports: SerialPortOption[];
  onChange: (next: DeviceTransport) => void;
}): ReactElement {
  return (
    <div className="flex flex-col gap-3">
      <Field label="Bağlantı">
        {({ id }) => (
          <Select
            id={id}
            value={value.kind}
            onChange={(event) => {
              const kind = event.target.value as DeviceTransport['kind'];
              // Tür değişince eski alanlar taşınmaz: `serial` iken girilen COM
              // yolu `network` yapılandırmasında anlamsız.
              if (kind === 'serial') onChange({ kind, path: ports[0]?.path ?? '', baudRate: 9600 });
              else if (kind === 'network') onChange({ kind, host: '', port: 9100 });
              else onChange({ kind: 'none' });
            }}
          >
            <option value="none">Tanımlı değil</option>
            <option value="serial">Seri / USB (COM)</option>
            <option value="network">Ağ (TCP)</option>
          </Select>
        )}
      </Field>

      {value.kind === 'serial' ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Port">
            {({ id }) => (
              <Select
                id={id}
                value={value.path}
                onChange={(event) => {
                  onChange({ ...value, path: event.target.value });
                }}
              >
                {ports.length === 0 ? <option value="">Port bulunamadı</option> : null}
                {ports.map((port) => (
                  <option key={port.path} value={port.path}>
                    {port.path}
                    {port.friendlyName ? ` — ${port.friendlyName}` : ''}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Hız (baud)" hint="Yazıcılarda 9600 ya da 19200 yaygın.">
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={String(value.baudRate)}
                inputMode="numeric"
                onChange={(event) => {
                  onChange({ ...value, baudRate: Number(event.target.value) || 9600 });
                }}
              />
            )}
          </Field>
        </div>
      ) : null}

      {value.kind === 'network' ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="IP adresi">
            {({ id }) => (
              <Input
                id={id}
                value={value.host}
                placeholder="192.168.1.50"
                onChange={(event) => {
                  onChange({ ...value, host: event.target.value.trim() });
                }}
              />
            )}
          </Field>
          <Field label="Port" hint="ESC/POS yazıcılarda genelde 9100.">
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={String(value.port)}
                inputMode="numeric"
                onChange={(event) => {
                  onChange({ ...value, port: Number(event.target.value) || 9100 });
                }}
              />
            )}
          </Field>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Cihaz ayarları ekranı.
 *
 * Bu ayarlar MAKİNEYE aittir (hangi COM portu, hangi IP, hangi monitör) ve
 * sunucuya gitmez. Her cihazın yanında bir test düğmesi var: kasada sorun
 * çıktığında "ayar mı, kablo mu" sorusunun cevabı kasiyerin elinde olsun,
 * kimse log dosyası açmak zorunda kalmasın.
 */
export function DeviceSettingsScreen({ onClose }: DeviceSettingsScreenProps): ReactElement {
  const toast = useToast();
  const [settings, setSettings] = useState<DeviceSettings | null>(null);
  const [ports, setPorts] = useState<SerialPortOption[]>([]);
  const [displays, setDisplays] = useState<DisplayOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      unwrap(bridge().devices.get()),
      unwrap(bridge().devices.serialPorts()).catch(() => [] as SerialPortOption[]),
      unwrap(bridge().devices.displays()).catch(() => [] as DisplayOption[]),
    ]).then(([loaded, portList, displayList]) => {
      if (!active) return;
      setSettings(loaded);
      setPorts(portList);
      setDisplays(displayList);
    });
    return () => {
      active = false;
    };
  }, []);

  const save = useCallback(
    (next: DeviceSettings) => {
      setSettings(next);
      setSaving(true);
      unwrap(bridge().devices.set(next))
        .then(setSettings)
        .catch((error: unknown) => {
          toast.error('Ayar kaydedilemedi', errorMessage(error));
        })
        .finally(() => {
          setSaving(false);
        });
    },
    [toast],
  );

  /** Test düğmelerinin ortak sarmalı: sonucu her zaman kasiyere söyler. */
  const runTest = useCallback(
    (key: string, title: string, action: () => Promise<unknown>, success: string) => {
      setTesting(key);
      action()
        .then(() => {
          toast.success(title, success);
        })
        .catch((error: unknown) => {
          toast.error(title, errorMessage(error, 'Cihaz yanıt vermedi.'));
        })
        .finally(() => {
          setTesting(null);
        });
    },
    [toast],
  );

  if (!settings) {
    return (
      <div className="bg-surface flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const busy = saving || testing !== null;

  return (
    <div className="bg-surface flex-1 overflow-y-auto p-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-ink text-xl font-semibold">Cihaz ayarları</h1>
            <p className="text-ink-muted text-sm">
              Bu ayarlar yalnız bu kasaya aittir; diğer kasaları etkilemez.
            </p>
          </div>
          <Button variant="ghost" onClick={onClose}>
            Satışa dön (Esc)
          </Button>
        </header>

        {/* Adlandırılmış bölge: ekran okuyucu bölümler arasında gezebilsin. */}
        <section aria-label="Fiş yazıcısı">
          <Card>
            <CardHeader>
              <CardTitle>Fiş yazıcısı</CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-3 pt-2">
              <TransportFields
                value={settings.printer.transport}
                ports={ports}
                onChange={(transport) => {
                  save({ ...settings, printer: { ...settings.printer, transport } });
                }}
              />

              <Field
                label="Türkçe karakter tablosu"
                hint="Test fişindeki Türkçe harfler bozuk çıkıyorsa diğerini deneyin."
              >
                {({ id, describedBy }) => (
                  <Select
                    id={id}
                    aria-describedby={describedBy}
                    value={settings.printer.codepage}
                    onChange={(event) => {
                      save({
                        ...settings,
                        printer: {
                          ...settings.printer,
                          codepage: event.target.value as DeviceSettings['printer']['codepage'],
                        },
                      });
                    }}
                  >
                    <option value="CP857">CP857 (DOS Türkçe)</option>
                    <option value="CP1254">CP1254 (Windows Türkçe)</option>
                  </Select>
                )}
              </Field>

              <Field label="Logo dosyası" hint="Kasa bilgisayarındaki PNG/JPEG dosyanın tam yolu.">
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    value={settings.printer.logoPath ?? ''}
                    placeholder="C:\\stokk\\logo.png"
                    onChange={(event) => {
                      setSettings({
                        ...settings,
                        printer: { ...settings.printer, logoPath: event.target.value || null },
                      });
                    }}
                    onBlur={() => {
                      save(settings);
                    }}
                  />
                )}
              </Field>

              <label className="text-ink flex items-center gap-2 text-sm">
                <Checkbox
                  checked={settings.printer.openDrawerOnCashSale}
                  onChange={(event) => {
                    save({
                      ...settings,
                      printer: { ...settings.printer, openDrawerOnCashSale: event.target.checked },
                    });
                  }}
                />
                Nakit satışta para çekmecesini aç
              </label>

              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  disabled={busy}
                  loading={testing === 'printer'}
                  onClick={() => {
                    runTest(
                      'printer',
                      'Test fişi',
                      () => unwrap(bridge().printer.test()),
                      'Fiş gönderildi. Türkçe harfleri kontrol edin.',
                    );
                  }}
                >
                  Test fişi bas
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  loading={testing === 'drawer'}
                  onClick={() => {
                    runTest(
                      'drawer',
                      'Para çekmecesi',
                      () => unwrap(bridge().cashDrawer.open()),
                      'Çekmece komutu gönderildi.',
                    );
                  }}
                >
                  Çekmece aç
                </Button>
              </div>
            </CardBody>
          </Card>
        </section>

        {/* Adlandırılmış bölge: ekran okuyucu bölümler arasında gezebilsin. */}
        <section aria-label="Terazi">
          <Card>
            <CardHeader>
              <CardTitle>Terazi</CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-3 pt-2">
              <TransportFields
                value={settings.scale.transport}
                ports={ports}
                onChange={(transport) => {
                  save({ ...settings, scale: { ...settings.scale, transport } });
                }}
              />
              <Field
                label="Protokol"
                hint="Otomatik, yaygın kalıpları sırayla dener. Yanlış okuma varsa modeli seçin."
              >
                {({ id, describedBy }) => (
                  <Select
                    id={id}
                    aria-describedby={describedBy}
                    value={settings.scale.protocol}
                    onChange={(event) => {
                      save({
                        ...settings,
                        scale: {
                          ...settings.scale,
                          protocol: event.target.value as DeviceSettings['scale']['protocol'],
                        },
                      });
                    }}
                  >
                    <option value="auto">Otomatik</option>
                    <option value="toledo">Toledo</option>
                    <option value="cas">CAS</option>
                    <option value="generic">Genel (ilk ondalıklı sayı)</option>
                  </Select>
                )}
              </Field>
              <div>
                <Button
                  variant="secondary"
                  disabled={busy}
                  loading={testing === 'scale'}
                  onClick={() => {
                    runTest(
                      'scale',
                      'Tartı',
                      async () => {
                        const reading = await unwrap(bridge().scale.read());
                        toast.success(
                          'Tartı okundu',
                          `${reading.weightKg} kg (${reading.protocol}, ${
                            reading.stable ? 'oturdu' : 'oturmadı'
                          })`,
                        );
                      },
                      'Okuma tamamlandı.',
                    );
                  }}
                >
                  Tartıyı oku
                </Button>
              </div>
            </CardBody>
          </Card>
        </section>

        {/* Adlandırılmış bölge: ekran okuyucu bölümler arasında gezebilsin. */}
        <section aria-label="Müşteri ekranı">
          <Card>
            <CardHeader>
              <CardTitle>Müşteri ekranı</CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-3 pt-2">
              <label className="text-ink flex items-center gap-2 text-sm">
                <Checkbox
                  checked={settings.customerDisplay.enabled}
                  onChange={(event) => {
                    save({
                      ...settings,
                      customerDisplay: {
                        ...settings.customerDisplay,
                        enabled: event.target.checked,
                      },
                    });
                  }}
                />
                İkinci ekranda müşteri ekranını göster
              </label>
              {/* Tek monitörlü kasada otomatik seçim ekranı AÇMAZ; kasiyerin ekranını
                kaplamak kasayı kullanılamaz kılardı. Kullanıcı isterse açıkça seçer. */}
              {settings.customerDisplay.enabled &&
              settings.customerDisplay.displayId === null &&
              displays.filter((display) => !display.primary).length === 0 ? (
                <p className="text-warning text-sm" role="status">
                  İkinci monitör bulunamadı; müşteri ekranı açılmayacak. Yine de göstermek
                  istiyorsanız aşağıdan bir ekran seçin.
                </p>
              ) : null}

              <Field label="Ekran" hint="Seçilmezse kasa ekranı dışındaki ilk monitör kullanılır.">
                {({ id, describedBy }) => (
                  <Select
                    id={id}
                    aria-describedby={describedBy}
                    value={
                      settings.customerDisplay.displayId === null
                        ? ''
                        : String(settings.customerDisplay.displayId)
                    }
                    onChange={(event) => {
                      save({
                        ...settings,
                        customerDisplay: {
                          ...settings.customerDisplay,
                          displayId: event.target.value === '' ? null : Number(event.target.value),
                        },
                      });
                    }}
                  >
                    <option value="">Otomatik</option>
                    {displays.map((display) => (
                      <option key={display.id} value={String(display.id)}>
                        {display.label}
                        {display.primary ? ' (kasa ekranı)' : ''}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </CardBody>
          </Card>
        </section>

        {/* Adlandırılmış bölge: ekran okuyucu bölümler arasında gezebilsin. */}
        <section aria-label="Banka POS ve ÖKC">
          <Card>
            <CardHeader>
              <CardTitle>Banka POS ve ÖKC</CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-3 pt-2">
              <p className="text-ink-muted text-sm">
                Gerçek cihaz sürücüleri banka ve ÖKC üreticisiyle yapılacak sözleşmeye bağlı.
                Şimdilik yalnız akışı denemek için sahte sürücü var.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Banka POS">
                  {({ id }) => (
                    <Select
                      id={id}
                      value={settings.posDevice.driver}
                      onChange={(event) => {
                        save({
                          ...settings,
                          posDevice: {
                            driver: event.target.value as DeviceSettings['posDevice']['driver'],
                          },
                        });
                      }}
                    >
                      <option value="none">Yok</option>
                      <option value="mock">Sahte cihaz (deneme)</option>
                    </Select>
                  )}
                </Field>
                <Field label="ÖKC">
                  {({ id }) => (
                    <Select
                      id={id}
                      value={settings.fiscal.driver}
                      onChange={(event) => {
                        save({
                          ...settings,
                          fiscal: {
                            driver: event.target.value as DeviceSettings['fiscal']['driver'],
                          },
                        });
                      }}
                    >
                      <option value="none">Yok</option>
                      <option value="mock">Sahte cihaz (deneme)</option>
                    </Select>
                  )}
                </Field>
              </div>
              <div>
                <Button
                  variant="secondary"
                  disabled={busy}
                  loading={testing === 'posDevice'}
                  onClick={() => {
                    runTest(
                      'posDevice',
                      'POS cihazı',
                      async () => {
                        const status = await unwrap(bridge().posDevice.status());
                        if (!status.connected) throw new Error(status.detail);
                        toast.success('POS cihazı', status.detail);
                      },
                      'Cihaz yanıt verdi.',
                    );
                  }}
                >
                  POS ping
                </Button>
              </div>
            </CardBody>
          </Card>
        </section>
      </div>
    </div>
  );
}
