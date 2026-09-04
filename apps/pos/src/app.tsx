import type {
  CashSession,
  NetworkStatus,
  PosConfig,
  PosSession,
  SyncStatus,
  UpdateStatus,
} from '@shared/ipc-contracts';
import { useCallback, useEffect, useState, type ReactElement } from 'react';


import { StatusBar } from './components/status-bar';
import { resolveStep } from './lib/boot-flow';
import { bridge, unwrap } from './lib/bridge';
import { LoginScreen } from './screens/login-screen';
import { ReadyScreen } from './screens/ready-screen';
import { RegisterSelectScreen } from './screens/register-select-screen';
import { ServerSetupScreen } from './screens/server-setup-screen';
import { ShiftOpenScreen } from './screens/shift-open-screen';
import { SplashScreen } from './screens/splash-screen';

const IDLE_NETWORK: NetworkStatus = {
  state: 'offline',
  lastOkAt: null,
  lastCheckedAt: new Date(0).toISOString(),
};

const IDLE_SYNC: SyncStatus = {
  phase: 'idle',
  lastPullAt: null,
  lastPushAt: null,
  pendingCount: 0,
  failedCount: 0,
  cachedProductCount: 0,
  lastError: null,
};

const IDLE_UPDATE: UpdateStatus = { phase: 'idle', version: null, percent: null, message: null };

export function App(): ReactElement {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<PosConfig | null>(null);
  const [session, setSession] = useState<PosSession | null>(null);
  const [shift, setShift] = useState<CashSession | null>(null);
  // Sorgu SONUCU (bulundu/bulunamadı) — "sürüyor mu" bundan türetilir; effect
  // gövdesinde setState yapmadan yükleniyor durumunu taşımanın yolu bu.
  const [shiftQueried, setShiftQueried] = useState(false);
  const [network, setNetwork] = useState<NetworkStatus>(IDLE_NETWORK);
  const [sync, setSync] = useState<SyncStatus>(IDLE_SYNC);
  const [update, setUpdate] = useState<UpdateStatus>(IDLE_UPDATE);
  const [editingServer, setEditingServer] = useState(false);
  const [editingRegister, setEditingRegister] = useState(false);

  // Açılış: main process'ten mevcut durumu topla. Ağ yoklaması yavaş olabilir,
  // splash onun için var.
  useEffect(() => {
    let active = true;
    async function boot(): Promise<void> {
      const api = bridge();
      const [nextConfig, nextSession, nextSync, nextUpdate] = await Promise.all([
        unwrap(api.system.getConfig()),
        unwrap(api.auth.session()),
        unwrap(api.sync.status()),
        unwrap(api.system.updateStatus()),
      ]);
      if (!active) return;
      setConfig(nextConfig);
      setSession(nextSession);
      setSync(nextSync);
      setUpdate(nextUpdate);

      // Sunucu ayarlıysa ağ durumunu sor; değilse kurulum ekranı zaten gelecek.
      if (nextConfig.serverUrl) {
        const status = await unwrap(api.system.networkStatus());
        if (active) setNetwork(status);
      }
      if (active) setLoading(false);
    }
    void boot().catch(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  // main → renderer olayları: ağ, sync, oturum, güncelleme.
  useEffect(() => {
    const api = bridge();
    const unsubscribes = [
      api.system.onNetworkChange(setNetwork),
      api.sync.onStatusChange(setSync),
      api.system.onUpdateChange(setUpdate),
      api.auth.onSessionChange((next) => {
        setSession(next);
        // Oturum düşünce vardiya bilgisi de geçersizdir; ekran onu yeniden sorar.
        if (!next) {
          setShift(null);
          setShiftQueried(false);
        }
      }),
    ];
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, []);

  // Açık vardiya sorgusunun TEK sahibi burasıdır.
  //
  // Aynı soruyu vardiya açılış ekranı da sorduğunda iki cevap yarışıyor: form
  // görünüyor, hemen ardından uygulama "hazır"a atlıyor ve kasiyerin dokunduğu
  // düğme ekrandan kayboluyordu.
  useEffect(() => {
    if (!session || !config?.registerId || shift || shiftQueried) return;
    let active = true;
    unwrap(bridge().shift.current())
      .then((current) => {
        if (active && current) setShift(current);
      })
      .catch(() => {
        // Çevrimdışıysa sorulamaz; vardiya açılış ekranı hatayı kendisi gösterir.
      })
      .finally(() => {
        if (active) setShiftQueried(true);
      });
    return () => {
      active = false;
    };
  }, [session, config?.registerId, shift, shiftQueried]);

  const handleLogout = useCallback(() => {
    void unwrap(bridge().auth.logout()).finally(() => {
      setSession(null);
      setShift(null);
      setShiftQueried(false);
    });
  }, []);

  const handleSyncNow = useCallback(() => {
    void unwrap(bridge().sync.run()).catch(() => undefined);
  }, []);

  const step = resolveStep({
    loading,
    config,
    session,
    shift,
    shiftLoading: session !== null && config?.registerId != null && shift === null && !shiftQueried,
    editingServer,
    editingRegister,
  });

  if (step === 'loading' || !config) return <SplashScreen />;

  if (step === 'server-setup') {
    return (
      <ServerSetupScreen
        initialUrl={config.serverUrl}
        onSaved={(next) => {
          setConfig(next);
          setEditingServer(false);
        }}
      />
    );
  }

  if (step === 'login') {
    return (
      <LoginScreen
        lastEmail={config.lastEmail}
        network={network}
        onLoggedIn={setSession}
        onChangeServer={() => setEditingServer(true)}
      />
    );
  }

  if (step === 'register-select') {
    return (
      <RegisterSelectScreen
        selectedId={config.registerId}
        onSelected={(next) => {
          setConfig(next);
          setEditingRegister(false);
          // Kasa değişti: eski kasanın vardiya cevabı artık geçersiz.
          setShift(null);
          setShiftQueried(false);
        }}
        onLogout={handleLogout}
      />
    );
  }

  if (step === 'shift-open') {
    return (
      <ShiftOpenScreen
        config={config}
        onOpened={setShift}
        onChangeRegister={() => setEditingRegister(true)}
      />
    );
  }

  return (
    <div className="bg-surface flex min-h-screen flex-col">
      <StatusBar
        session={session as PosSession}
        network={network}
        sync={sync}
        update={update}
        onSyncNow={handleSyncNow}
        onLogout={handleLogout}
      />
      <ReadyScreen config={config} shift={shift as CashSession} sync={sync} />
    </div>
  );
}
