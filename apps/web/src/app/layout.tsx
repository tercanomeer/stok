import type { Metadata } from 'next';
import { IBM_Plex_Sans } from 'next/font/google';
import type { ReactNode } from 'react';

import { Providers } from '../components/providers';
import './globals.css';

// Ledger/teknik karakter + Türkçe (ş/ğ/ı/İ) tam desteği + tabular rakam.
const plex = IBM_Plex_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Stokk — Yönetim Paneli',
  description: 'Market, bakkal ve tekel için bulut tabanlı POS ve stok yönetimi',
};

export default function RootLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <html lang="tr" className={plex.variable} suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
