import 'reflect-metadata';

import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { HealthModule } from './health.module.js';
import { TransformResponseInterceptor } from '../../common/interceptors/transform-response.interceptor.js';

describe('GET /health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HealthModule],
      providers: [{ provide: APP_INTERCEPTOR, useClass: TransformResponseInterceptor }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('zarflı yanıt döner: { ok: true, data }', async () => {
    const server = app.getHttpServer() as Server;
    const response = await request(server).get('/health').expect(200);

    expect(response.body).toMatchObject({
      ok: true,
      data: { status: 'up', service: '@stokk/api' },
    });
  });
});
