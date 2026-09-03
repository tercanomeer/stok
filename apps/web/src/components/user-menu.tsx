'use client';

import { ChevronDown, LogOut } from 'lucide-react';
import { useRef, type ReactElement } from 'react';

import { apiPostVoid } from '../lib/api';
import { useAuthStore } from '../stores/auth-store';

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/** Kullanıcı menüsü — yerel `<details>` açılır (klavye erişilebilir). Çıkışta oturum temizlenir. */
export function UserMenu(): ReactElement {
  const ref = useRef<HTMLDetailsElement>(null);
  const user = useAuthStore((s) => s.user);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const clear = useAuthStore((s) => s.clear);

  async function logout(): Promise<void> {
    try {
      if (refreshToken) await apiPostVoid('/auth/logout', { refreshToken });
    } catch {
      // Çıkış sunucuda başarısız olsa da istemci oturumunu temizle.
    } finally {
      clear();
      window.location.href = '/login';
    }
  }

  if (!user) return <span />;

  return (
    <details ref={ref} className="group relative">
      <summary
        aria-label="Kullanıcı menüsü"
        className="rounded-control hover:bg-surface-sunken flex cursor-pointer list-none items-center gap-2 px-2 py-1.5 [&::-webkit-details-marker]:hidden"
      >
        <span className="bg-brand-weak text-brand-weak-ink flex size-8 items-center justify-center rounded-full text-sm font-semibold">
          {initials(user.fullName)}
        </span>
        <span className="hidden text-left sm:block">
          <span className="text-ink block text-sm font-medium">{user.fullName}</span>
          <span className="text-ink-muted block text-xs">{user.roles[0] ?? 'Kullanıcı'}</span>
        </span>
        <ChevronDown
          className="text-ink-muted size-4 transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="rounded-card border-border bg-surface-raised absolute right-0 z-20 mt-1 w-56 border p-1 shadow-[var(--shadow-overlay)]">
        <div className="border-border border-b px-3 py-2">
          <p className="text-ink truncate text-sm font-medium">{user.fullName}</p>
          <p className="text-ink-muted truncate text-xs">{user.email}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            void logout();
          }}
          className="rounded-control text-ink hover:bg-surface-sunken mt-1 flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
        >
          <LogOut className="size-4" aria-hidden />
          Çıkış yap
        </button>
      </div>
    </details>
  );
}
