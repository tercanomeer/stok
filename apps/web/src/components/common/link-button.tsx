import Link from 'next/link';
import type { ReactElement, ReactNode } from 'react';

import { buttonVariants, cn } from '@stokk/ui';

export interface LinkButtonProps {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'link';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Buton görünümlü bağlantı. Gezinme `<a>` ile yapılır (yeni sekme, kopyala,
 * ekran okuyucu "link" der) ama görsel dil butonla aynı kalır.
 */
export function LinkButton({
  href,
  children,
  variant = 'primary',
  size = 'md',
  className,
}: LinkButtonProps): ReactElement {
  return (
    <Link href={href} className={cn(buttonVariants({ variant, size }), className)}>
      {children}
    </Link>
  );
}
