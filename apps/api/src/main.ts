import 'reflect-metadata';

import path from 'node:path';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import compression from 'compression';
import { config as loadDotenv } from 'dotenv';
import helmet from 'helmet';

import { AppModule } from './app.module.js';
import { loadEnv } from './config/env.js';

async function bootstrap(): Promise<void> {
  // ESM'de import'lar hoist edilir; .env bu yüzden bootstrap içinde,
  // env doğrulamasından hemen önce yükleniyor.
  loadDotenv({ path: path.resolve(import.meta.dirname, '../../../.env'), quiet: true });

  // Env doğrulaması Nest ayağa kalkmadan önce; hatalıysa uygulama açılmaz.
  const env = loadEnv();

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.use(helmet());
  app.use(compression());
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });
  app.enableShutdownHooks();

  await app.listen(env.API_PORT);
  new Logger('Bootstrap').log(`@stokk/api ${env.NODE_ENV} modunda :${env.API_PORT} portunda`);
}

void bootstrap();
