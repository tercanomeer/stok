import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

// Playwright spec'leri CJS'e çevirerek koşturuyor; `import.meta` burada yok.
const POS_DIR = path.resolve(__dirname, '../../../apps/pos');

/**
 * Electron binary'sinin yolu.
 *
 * Elle kurmak yerine `electron` paketinin kendi dışa verdiği yol okunuyor: pnpm
 * paketi symlink'liyor ve platforma göre (Electron.app / electron.exe / electron)
 * yol değişiyor — ikisini de elle yönetmek kırılgan.
 *
 * Playwright'ın `_electron` sürücüsü paketlenmiş uygulamayı değil geliştirme
 * ağacını açar; önce `pnpm --filter @stokk/pos build` gerekir.
 */
function electronBinary(): string {
  const posRequire = createRequire(path.join(POS_DIR, 'package.json'));
  return posRequire('electron') as string;
}

export interface LaunchedPos {
  app: ElectronApplication;
  page: Page;
  /** Kasa PC'sinin kalıcı verisi — testler arası taşınabilir (aynı makine etkisi). */
  userDataDir: string;
  close(): Promise<void>;
}

/**
 * POS'u izole bir `userData` dizini ile açar.
 *
 * `userDataDir` dışarıdan verilirse aynı kasa yeniden başlatılmış olur: önbellek,
 * kuyruk ve şifreli oturum yerinde kalır. Çevrimdışı girişin sınandığı yer burası.
 */
export async function launchPos(userDataDir?: string): Promise<LaunchedPos> {
  const dir = userDataDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'stokk-pos-e2e-'));

  const app = await electron.launch({
    executablePath: electronBinary(),
    args: [POS_DIR, `--user-data-dir=${dir}`],
    cwd: POS_DIR,
    timeout: 60_000,
  });

  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  return {
    app,
    page,
    userDataDir: dir,
    close: async () => {
      await app.close();
    },
  };
}
