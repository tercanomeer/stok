import type { HTMLAttributes, ReactElement, TdHTMLAttributes, ThHTMLAttributes } from 'react';

import { cn } from '../lib/cn.js';

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>): ReactElement {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-sm', className)} {...props} />
    </div>
  );
}

export function THead({
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>): ReactElement {
  return <thead className={cn('border-border border-b', className)} {...props} />;
}

export function TBody({
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>): ReactElement {
  return (
    <tbody
      className={cn('[&_tr]:border-border [&_tr:not(:last-child)]:border-b', className)}
      {...props}
    />
  );
}

export function TR({ className, ...props }: HTMLAttributes<HTMLTableRowElement>): ReactElement {
  return <tr className={cn('hover:bg-surface-sunken/60', className)} {...props} />;
}

export interface CellProps extends ThHTMLAttributes<HTMLTableCellElement> {
  /** Sayısal sütun: sağa yasla + tabular rakam. */
  numeric?: boolean;
}

export function TH({ className, numeric, ...props }: CellProps): ReactElement {
  return (
    <th
      scope="col"
      className={cn(
        'text-ink-muted px-3 py-2.5 text-left font-medium',
        numeric && 'tabular text-right',
        className,
      )}
      {...props}
    />
  );
}

export interface TdProps extends TdHTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean;
}

export function TD({ className, numeric, ...props }: TdProps): ReactElement {
  return (
    <td
      className={cn('text-ink px-3 py-2.5', numeric && 'tabular text-right', className)}
      {...props}
    />
  );
}
