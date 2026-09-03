import type { ReactElement, ReactNode } from 'react';

export interface PageHeaderProps {
  title: string;
  description?: string;
  /** Sağdaki birincil eylemler. */
  actions?: ReactNode;
}

/** Ekran başlığı — her yönetim ekranının aynı yükseklikte açılışı. */
export function PageHeader({ title, description, actions }: PageHeaderProps): ReactElement {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h1 className="text-ink text-xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-ink-muted text-sm">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
