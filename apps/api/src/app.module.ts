import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { TransformResponseInterceptor } from './common/interceptors/transform-response.interceptor.js';
import { ConfigModule } from './config/config.module.js';
import { HealthModule } from './modules/health/health.module.js';

@Module({
  imports: [ConfigModule, HealthModule],
  providers: [{ provide: APP_INTERCEPTOR, useClass: TransformResponseInterceptor }],
})
export class AppModule {}
