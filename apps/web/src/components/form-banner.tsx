import { TriangleAlert } from 'lucide-react';
import type { ReactElement } from 'react';

/** Form üstü sunucu hatası bandı — role="alert" ile okuyucuya bildirilir. */
export function FormBanner({ message }: { message: string }): ReactElement {
  return (
    <div
      role="alert"
      className="rounded-control border-danger/30 bg-danger-weak text-danger flex items-start gap-2 border px-3 py-2 text-sm"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}
