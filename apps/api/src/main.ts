import 'reflect-metadata';

import path from 'node:path';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
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

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });

  app.use(helmet());
  app.use(compression());
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });
  app.enableShutdownHooks();

  // Caddy/nginx arkasında gerçek istemci IP'si X-Forwarded-For'dan gelir;
  // ayarlanmazsa rate limit tüm kullanıcıları tek IP sayıp hepsini keser.
  app.set('trust proxy', 1);

  if (env.NODE_ENV !== 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Stokk API')
        .setDescription('Market ve bakkal için POS ve stok yönetimi')
        .setVersion('0.1')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen(env.API_PORT);

  const logger = new Logger('Bootstrap');
  logger.log(`@stokk/api ${env.NODE_ENV} modunda :${env.API_PORT} portunda`);
  if (env.NODE_ENV !== 'production') {
    logger.log(`Swagger: http://localhost:${env.API_PORT}/docs`);
  }
}

void bootstrap();
