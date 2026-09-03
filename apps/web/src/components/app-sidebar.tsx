'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactElement } from 'react';

import { Badge, cn } from '@stokk/ui';

import { BrandWordmark } from './brand-mark';
import { NAV_ITEMS } from './nav';
import { useAuthStore } from '../stores/auth-store';

/** Sol menü: marka + izne göre filtrelenmiş gezinme. Aktif öğe marka şeridiyle işaretli. */
export function AppSidebar(): ReactElement {
  const pathname = usePathname();
  const permissions = useAuthStore((s) => s.user?.permissions) ?? [];

  const items = NAV_ITEMS.filter(
    (item) => !item.permission || permissions.includes(item.permission),
  );

  return (
    <aside className="border-border bg-surface-sunken no-print hidden h-full w-60 shrink-0 flex-col border-r lg:flex">
      <div className="flex h-16 items-center px-5">
        <BrandWordmark />
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2" aria-label="Ana menü">
        {items.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          const Icon = item.icon;

          if (item.soon) {
            return (
              <span
                key={item.href}
                aria-disabled
                className="rounded-control text-ink-subtle flex cursor-not-allowed items-center gap-3 px-3 py-2 text-sm"
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="flex-1">{item.label}</span>
                <Badge tone="neutral">Yakında</Badge>
              </span>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-control relative flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-brand-weak text-brand-weak-ink before:bg-brand before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full'
                  : 'text-ink-muted hover:bg-surface-raised hover:text-ink',
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
