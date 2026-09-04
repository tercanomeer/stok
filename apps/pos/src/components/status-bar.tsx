import type { NetworkStatus, PosSession, SyncStatus, UpdateStatus } from '@shared/ipc-contracts';
import { CloudOff, CloudUpload, Download, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import type { ReactElement } from 'react';

import { Badge, Button, formatRelative } from '@stokk/ui';


interface StatusBarProps {
  session: PosSession;
  network: NetworkStatus;
  sync: SyncStatus;
  update: UpdateStatus;
  onSyncNow: () => void;
  onLogout: () => void;
}

function networkBadge(network: NetworkStatus): ReactElement {
  if (network.state === 'online') {
    return (
      <Badge tone="success">
        <Wifi aria-hidden />
        Çevrimiçi
      </Badge>
    );
  }
  // İki farklı arıza, iki farklı çözüm: kablo mu, adres/sunucu mu.
  return network.state === 'unreachable' ? (
    <Badge tone="warning">
      <CloudOff aria-hidden />
      Sunucuya ulaşılamıyor
    </Badge>
  ) : (
    <Badge tone="danger">
      <WifiOff aria-hidden />
      Çevrimdışı
    </Badge>
  );
}

/**
 * Üst şerit: kasiyerin gün boyu göz ucuyla baktığı yer.
 *
 * Bekleyen satış sayısı gizlenmez — çevrimdışı çalışırken "kaç satışım henüz
 * gitmedi" sorusunun cevabı ekranda durmalı.
 */
export function StatusBar({
  session,
  network,
  sync,
  update,
  onSyncNow,
  onLogout,
}: StatusBarProps): ReactElement {
  return (
    <header className="border-border bg-surface-raised flex items-center gap-3 border-b px-4 py-2">
      <span className="text-ink text-sm font-semibold">Stokk POS</span>

      {networkBadge(network)}

      {session.offline ? <Badge tone="warning">Çevrimdışı oturum</Badge> : null}

      {sync.pendingCount > 0 ? (
        <Badge tone="brand">
          <CloudUpload aria-hidden />
          {sync.pendingCount} satış bekliyor
        </Badge>
      ) : null}

      {sync.failedCount > 0 ? (
        <Badge tone="danger">{sync.failedCount} satış gönderilemedi</Badge>
      ) : null}

      {update.phase === 'ready' ? (
        <Badge tone="brand">
          <Download aria-hidden />
          Güncelleme çıkışta kurulacak
        </Badge>
      ) : null}

      <span className="text-ink-muted ml-auto text-xs">
        {sync.lastPullAt
          ? `Katalog ${formatRelative(sync.lastPullAt)} güncellendi`
          : 'Katalog henüz alınmadı'}
      </span>

      <Button
        variant="ghost"
        size="sm"
        loading={sync.phase !== 'idle'}
        disabled={network.state !== 'online'}
        onClick={onSyncNow}
      >
        <RefreshCw aria-hidden />
        Eşitle
      </Button>

      <Button variant="ghost" size="sm" onClick={onLogout}>
        {session.user.fullName} · Çıkış
      </Button>
    </header>
  );
}
