import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * İstek boyunca taşınan kimlik bağlamı.
 *
 * `tenantId` İSTEMCİDEN ALINMAZ — yalnız doğrulanmış JWT payload'ından gelir
 * (03-mimari.md "Multi-tenancy", 1. katman). Buradaki değer RLS'e `app.tenant_id`
 * olarak aktarılır; yanlış veya eksikse veritabanı hiçbir satır döndürmez.
 */
export interface TenantContext {
  tenantId: string;
  userId: string;
  permissions: readonly string[];
}

const storage = new AsyncLocalStorage<TenantContext>();

export function runWithTenantContext<T>(context: TenantContext, callback: () => T): T {
  return storage.run(context, callback);
}

export function getTenantContext(): TenantContext | undefined {
  return storage.getStore();
}

export function requireTenantContext(): TenantContext {
  const context = storage.getStore();
  if (!context) {
    throw new Error('Tenant bağlamı yok — bu kod yolu kimlik doğrulaması gerektiriyor.');
  }
  return context;
}
