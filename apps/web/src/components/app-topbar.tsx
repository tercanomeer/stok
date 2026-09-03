'use client';

import type { ReactElement } from 'react';

import { Breadcrumbs } from './breadcrumbs';
import { ShiftStatus } from './shift-status';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';

/** Üst çubuk: konum (kırıntı) solda; vardiya durumu, tema ve kullanıcı sağda. */
export function AppTopbar(): ReactElement {
  return (
    <header className="border-border bg-surface flex h-16 shrink-0 items-center justify-between gap-4 border-b px-6">
      <Breadcrumbs />
      <div className="flex items-center gap-2">
        <ShiftStatus />
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
