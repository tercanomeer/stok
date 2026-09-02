import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';

import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { PermissionsGuard } from './common/guards/permissions.guard.js';
import { TenantContextInterceptor } from './common/interceptors/tenant-context.interceptor.js';
import { TransformResponseInterceptor } from './common/interceptors/transform-response.interceptor.js';
import { ConfigModule, ENV } from './config/config.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { ProductsModule } from './modules/products/products.module.js';
import { RolesModule } from './modules/roles/roles.module.js';
import { StockModule } from './modules/stock/stock.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RedisModule } from './redis/redis.module.js';
import { StorageModule } from './storage/storage.module.js';

@Module({
  imports: [
    ConfigModule,
    EventEmitterModule.forRoot(),
    PrismaModule,
    RedisModule,
    StorageModule,
    AuditModule,
    // BullMQ (Excel import kuyruğu) — Redis bağlantısı env'den.
    BullModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: { REDIS_URL: string }) => {
        const url = new URL(env.REDIS_URL);
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            ...(url.password ? { password: url.password } : {}),
          },
        };
      },
    }),
    // Genel API 100/dk; auth endpoint'lerinin kendi sıkı limiti var (auth.controller).
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: seconds(60), limit: 100 }],
    }),
    AuthModule,
    UsersModule,
    RolesModule,
    CatalogModule,
    ProductsModule,
    StockModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: TransformResponseInterceptor },
    // Guard'lardan sonra, handler'dan hemen önce: tenant bağlamını kurar.
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    // Sıra önemli: önce rate limit, sonra kimlik, sonra yetki.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
