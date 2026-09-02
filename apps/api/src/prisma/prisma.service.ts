import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

import { TENANT_SCOPED_MODELS, createPrismaClient, type PrismaClient } from '@stokk/db';

import { getTenantContext } from './tenant-context.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';

/**
 * Tenant'a bağlı modeller. Prisma 7 çalışma zamanında DMMF sunmuyor; liste
 * @stokk/db'de tutuluyor ve orada bir test onu schema.prisma ile karşılaştırıyor.
 */
const TENANT_SCOPED = new Set<string>(TENANT_SCOPED_MODELS);

const WHERE_OPERATIONS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'updateMany',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);

const CREATE_OPERATIONS = new Set(['create', 'createMany', 'createManyAndReturn', 'upsert']);

type TenantAwareClient = ReturnType<typeof extendWithTenant>;
export type TenantTransaction = Omit<
  TenantAwareClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;

/**
 * Prisma'nın `$allOperations` callback'i jenerik değil; sınırda bir kez tipliyoruz
 * ki aşağıdaki kod `any` üzerinde çalışmasın.
 */
interface AllOperationsParams {
  model?: string;
  operation: string;
  args: { where?: Record<string, unknown>; data?: unknown };
  query: (args: unknown) => Promise<unknown>;
}

function extendWithTenant(client: PrismaClient) {
  return client.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        $allOperations(params): Promise<unknown> {
          const { model, operation, args, query } = params as unknown as AllOperationsParams;
          const context = getTenantContext();

          if (!context || !model || !TENANT_SCOPED.has(model)) {
            return query(args);
          }

          const { tenantId } = context;

          if (WHERE_OPERATIONS.has(operation)) {
            args.where = { ...(args.where ?? {}), tenantId };
          } else if (CREATE_OPERATIONS.has(operation)) {
            if (Array.isArray(args.data)) {
              args.data = (args.data as Record<string, unknown>[]).map((row) => ({
                tenantId,
                ...row,
              }));
            } else if (args.data) {
              args.data = { tenantId, ...(args.data as Record<string, unknown>) };
            }
            if (operation === 'upsert' && args.where) {
              args.where = { ...args.where, tenantId };
            }
          }

          return query(args);
        },
      },
    },
  });
}

/**
 * İki ayrı bağlantı:
 *
 *  - `app`   — APP_DATABASE_URL, `stokk_app` rolü. Tablo sahibi DEĞİL, dolayısıyla
 *              row-level security politikalarına TABİDİR. Neredeyse tüm iş kodu bunu kullanır.
 *  - `system`— DATABASE_URL, tablo sahibi. RLS'i baypas eder. YALNIZCA kimlik
 *              doğrulanmadan önce tenant'ın henüz bilinmediği dar sorgular için
 *              (e-posta ile kullanıcı arama, kayıt, şifre sıfırlama token'ı).
 *              Bu ayrım bilinçli ve denetlenebilir olsun diye iki alan halinde duruyor.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly appClient: PrismaClient;

  /** RLS'e tabi, tenant bağlamını otomatik uygulayan istemci. */
  readonly app: TenantAwareClient;
  /** RLS'i baypas eden istemci — yalnız kimlik doğrulama öncesi dar sorgular. */
  readonly system: PrismaClient;

  constructor(@Inject(ENV) env: Env) {
    this.appClient = createPrismaClient(env.APP_DATABASE_URL);
    this.app = extendWithTenant(this.appClient);
    this.system = createPrismaClient(env.DATABASE_URL);
  }

  async onModuleInit(): Promise<void> {
    await Promise.all([this.appClient.$connect(), this.system.$connect()]);
    this.logger.log('Prisma bağlantıları açıldı (app: RLS altında, system: sahip).');
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.appClient.$disconnect(), this.system.$disconnect()]);
  }

  /**
   * Tenant bağlamını veritabanına bildirir ve verilen işi o transaction içinde çalıştırır.
   *
   * `set_config(..., true)` = SET LOCAL: ayar transaction bitince düşer, havuzdaki
   * bağlantı bir sonraki isteğe sızdırmaz. Ayar verilmeden çalışan bir sorgu
   * RLS tarafından 0 satıra düşürülür — fail-closed.
   */
  async withTenant<T>(
    callback: (tx: TenantTransaction, tenantId: string) => Promise<T>,
    tenantId?: string,
  ): Promise<T> {
    const resolved = tenantId ?? getTenantContext()?.tenantId;
    if (!resolved) {
      throw new Error('withTenant tenant bağlamı olmadan çağrıldı.');
    }

    return this.app.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${resolved}, true)`;
      // tenantId callback'e de veriliyor: extension onu çalışma zamanında enjekte
      // ediyor ama Prisma'nın create tipleri onu yine de zorunlu görüyor.
      return callback(tx, resolved);
    });
  }
}
