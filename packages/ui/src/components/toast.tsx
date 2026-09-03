'use client';

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

import { cn } from '../lib/cn.js';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string | undefined;
}

interface ToastApi {
  show: (toast: { tone?: ToastTone; title: string; description?: string | undefined }) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONE_ICON = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
} as const;

const TONE_CLASS = {
  info: 'text-ink-muted',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
} as const;

/**
 * Toast sağlayıcı — `aria-live="polite"` bölgesi; hata tonu `assertive`.
 * 5 sn sonra otomatik kapanır, elle de kapatılabilir.
 */
export function ToastProvider({ children }: { children: ReactNode }): ReactElement {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback<ToastApi['show']>(
    ({ tone = 'info', title, description }) => {
      const id = ++seq.current;
      setItems((prev) => [...prev, { id, tone, title, description }]);
      setTimeout(() => {
        dismiss(id);
      }, 5000);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (title, description) => {
        show({ tone: 'success', title, description });
      },
      error: (title, description) => {
        show({ tone: 'danger', title, description });
      },
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
        role="region"
        aria-label="Bildirimler"
      >
        {items.map((t) => {
          const Icon = TONE_ICON[t.tone];
          return (
            <div
              key={t.id}
              role={t.tone === 'danger' ? 'alert' : 'status'}
              aria-live={t.tone === 'danger' ? 'assertive' : 'polite'}
              className="rounded-card border-border bg-surface-raised pointer-events-auto flex items-start gap-3 border p-3 shadow-[var(--shadow-overlay)]"
            >
              <Icon className={cn('mt-0.5 size-5 shrink-0', TONE_CLASS[t.tone])} aria-hidden />
              <div className="flex-1">
                <p className="text-ink text-sm font-medium">{t.title}</p>
                {t.description ? <p className="text-ink-muted text-sm">{t.description}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => {
                  dismiss(t.id);
                }}
                aria-label="Bildirimi kapat"
                className="rounded-control text-ink-muted hover:bg-surface-sunken hover:text-ink p-0.5"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast, ToastProvider içinde kullanılmalı.');
  return ctx;
}
