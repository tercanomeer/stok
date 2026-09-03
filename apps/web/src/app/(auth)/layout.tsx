import type { ReactNode } from 'react';

import { AuthRedirect } from '../../components/auth-redirect';
import { BrandWordmark } from '../../components/brand-mark';

/**
 * Kimlik ekranları düzeni — bölünmüş: solda marka paneli (yeşil zemin, dürüst tek
 * satır), sağda form. Mobilde yalnız form; marka üstte şerit olarak.
 */
export default function AuthLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <aside className="bg-brand text-brand-ink relative hidden flex-col justify-between p-10 lg:flex">
        <span className="inline-flex items-center gap-2">
          <span className="bg-brand-ink text-brand inline-flex size-8 items-center justify-center rounded-[0.55rem] font-semibold">
            S
          </span>
          <span className="text-lg font-semibold tracking-tight">Stokk</span>
        </span>
        <div className="max-w-md space-y-4">
          <p className="text-3xl leading-tight font-semibold tracking-tight">
            Dükkânın kasası, stoğu ve defteri tek ekranda.
          </p>
          <p className="text-brand-ink/80">
            Satışı kasada yap, stok ve cari otomatik işlensin; günün cirosunu ve kârını buradan gör.
          </p>
        </div>
        <p className="text-brand-ink/70 text-sm">
          Market, bakkal, tekel, nalbur ve pet shop için tasarlandı.
        </p>
      </aside>

      <main className="bg-surface flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <BrandWordmark />
          </div>
          <AuthRedirect>{children}</AuthRedirect>
        </div>
      </main>
    </div>
  );
}
