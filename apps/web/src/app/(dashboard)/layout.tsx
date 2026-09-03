import type { ReactNode } from 'react';

import { AppSidebar } from '../../components/app-sidebar';
import { AppTopbar } from '../../components/app-topbar';
import { RouteGuard } from '../../components/route-guard';

/** Panel kabuğu: oturum kapısı + sidebar + topbar + içerik. */
export default function DashboardLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <RouteGuard>
      <div className="flex h-screen overflow-hidden">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppTopbar />
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </RouteGuard>
  );
}
