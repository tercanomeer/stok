import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { ApiUser, AuthSession } from '../lib/api-types';

interface AuthState {
  user: ApiUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  /** persist rehydrate tamamlandı mı — guard'ın erken redirect'ini önler. */
  hydrated: boolean;
  setSession: (session: AuthSession) => void;
  /** Sessiz refresh sonrası token'ları tazele, kullanıcıyı koru. */
  setTokens: (tokens: { accessToken: string; refreshToken: string }) => void;
  clear: () => void;
  markHydrated: () => void;
}

/**
 * Kimlik durumu. Oturum localStorage'da tutulur (yenilemede hayatta kalır);
 * axios interceptor React dışından `getState()` ile token'a erişir.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      hydrated: false,
      setSession: (session) => {
        set({
          user: session.user,
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
        });
      },
      setTokens: ({ accessToken, refreshToken }) => {
        set({ accessToken, refreshToken });
      },
      clear: () => {
        set({ user: null, accessToken: null, refreshToken: null });
      },
      markHydrated: () => {
        set({ hydrated: true });
      },
    }),
    {
      name: 'stokk.auth',
      // SSR uyumu: otomatik rehydrate KAPALI. İlk client render'ı sunucuyla
      // aynı (hydrated=false) olsun; rehydrate mount'ta Providers'ta tetiklenir.
      skipHydration: true,
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
      onRehydrateStorage: () => (state) => {
        state?.markHydrated();
      },
    },
  ),
);
