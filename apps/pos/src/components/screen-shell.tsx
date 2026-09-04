import type { ReactElement, ReactNode } from 'react';

import { Card, CardBody } from '@stokk/ui';

interface ScreenShellProps {
  title: string;
  description?: string;
  /** Kaçıncı adımdayız — açılış akışı beş adım (sunucu → giriş → kasa → vardiya). */
  step?: { current: number; total: number };
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Açılış akışının ortak kabuğu: ortalanmış tek kart. Kasiyer bu ekranlarda tek bir
 * karar veriyor; ekranda başka hiçbir şey olmamalı.
 */
export function ScreenShell({
  title,
  description,
  step,
  children,
  footer,
}: ScreenShellProps): ReactElement {
  return (
    <div className="bg-surface-sunken flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardBody className="flex flex-col gap-5">
          <header className="flex flex-col gap-1">
            {step ? (
              <p className="text-ink-muted text-xs font-medium tracking-wide">
                Adım {step.current} / {step.total}
              </p>
            ) : null}
            <h1 className="text-ink text-xl font-semibold">{title}</h1>
            {description ? <p className="text-ink-muted text-sm">{description}</p> : null}
          </header>
          {children}
          {footer ? <div className="border-border border-t pt-4">{footer}</div> : null}
        </CardBody>
      </Card>
    </div>
  );
}
