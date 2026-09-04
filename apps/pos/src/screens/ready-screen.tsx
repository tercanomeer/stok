import type { CashSession, PosConfig, SyncStatus } from '@shared/ipc-contracts';
import type { ReactElement } from 'react';

import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  formatCount,
  formatDateTime,
  formatMoney,
} from '@stokk/ui';


interface ReadyScreenProps {
  config: PosConfig;
  shift: CashSession;
  sync: SyncStatus;
}

/**
 * Vardiya açıldıktan sonraki ekran. Satış arayüzü Faz 13'te buraya gelecek;
 * şimdilik kasanın çalışmaya hazır olduğunu ve önbelleğin durumunu gösterir.
 */
export function ReadyScreen({ config, shift, sync }: ReadyScreenProps): ReactElement {
  return (
    <div className="bg-surface flex-1 p-6">
      <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Vardiya açık</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-1 pt-2 text-sm">
            <p className="text-ink-muted">
              Kasa: <span className="text-ink">{config.registerName ?? shift.registerId}</span>
            </p>
            <p className="text-ink-muted">
              Açılış nakdi: <span className="text-ink">{formatMoney(shift.openingAmount)}</span>
            </p>
            <p className="text-ink-muted">
              Açılış: <span className="text-ink">{formatDateTime(shift.openedAt)}</span>
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Yerel önbellek</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-1 pt-2 text-sm">
            <p className="text-ink-muted">
              Ürün: <span className="text-ink">{formatCount(sync.cachedProductCount)}</span>
            </p>
            <p className="text-ink-muted">
              Gönderilmeyi bekleyen satış:{' '}
              <span className="text-ink">{formatCount(sync.pendingCount)}</span>
            </p>
            <p className="text-ink-muted">
              Gönderilemeyen satış:{' '}
              <span className="text-ink">{formatCount(sync.failedCount)}</span>
            </p>
            {sync.lastError ? (
              <p className="text-danger" role="status">
                Son hata: {sync.lastError}
              </p>
            ) : null}
          </CardBody>
        </Card>

        <Card className="md:col-span-2">
          <CardBody className="text-ink-muted text-sm">
            Satış ekranı Faz 13&apos;te bu alana gelecek. Kasa şu an satışa hazır: katalog yerelde,
            internet kesilse de satış yazılabilir ve bağlantı gelince kuyruk kendiliğinden boşalır.
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
