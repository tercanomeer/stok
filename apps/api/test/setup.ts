import path from 'node:path';

import { config as loadEnv } from 'dotenv';

// E2E testleri gerçek Postgres ve Redis'e bağlanır (docker compose ayakta olmalı).
loadEnv({ path: path.resolve(__dirname, '../../../.env'), quiet: true });
