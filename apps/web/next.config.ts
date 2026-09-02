import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Monorepo kökü: standalone çıktı workspace bağımlılıklarını da toplasın.
  outputFileTracingRoot: path.join(dirname, '../../'),
  transpilePackages: ['@stokk/ui'],
};

export default nextConfig;
