import { randomUUID } from 'node:crypto';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

interface Envelope<T> {
  ok: boolean;
  data: T;
  error?: { code: string; message: string };
}

async function call<T>(
  path: string,
  init: { method?: string; body?: unknown; token?: string } = {},
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(init.token === undefined ? {} : { Authorization: `Bearer ${init.token}` }),
      // Auth uçlarında IP başına 5 istek/dk limiti var; her çağrı ayrı IP taklit eder.
      'X-Forwarded-For': `10.97.${String(Math.floor(Math.random() * 250))}.${String(Math.floor(Math.random() * 250) + 1)}`,
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const envelope = (await response.json()) as Envelope<T>;
  if (!envelope.ok) {
    throw new Error(`${path} → ${String(response.status)} ${envelope.error?.message ?? ''}`);
  }
  return envelope.data;
}

export interface TestTenant {
  email: string;
  password: string;
  token: string;
  registerId: string;
  unitId: string;
}

export async function apiReachable(): Promise<boolean> {
  try {
    await call<{ status: string }>('/health');
    return true;
  } catch {
    return false;
  }
}

/** POS testleri için taze tenant: ürünler, varsayılan kasa, birim. */
export async function seedTenant(productCount = 3): Promise<TestTenant> {
  const email = `faz12-e2e-${randomUUID()}@stokk.test`;
  const password = 'CokGizliParola1';

  const registered = await call<{ accessToken: string }>('/auth/register', {
    method: 'POST',
    body: {
      businessName: `FAZ12-E2E ${randomUUID().slice(0, 8)}`,
      fullName: 'E2E Patron',
      email,
      password,
    },
  });
  const token = registered.accessToken;

  const units = await call<{ id: string; abbreviation: string }[]>('/units', { token });
  const unitId = units.find((unit) => unit.abbreviation === 'ad')?.id ?? units[0]?.id ?? '';

  const registers = await call<{ id: string }[]>('/registers', { token });
  const registerId = registers[0]?.id ?? '';

  for (let index = 1; index <= productCount; index += 1) {
    await call('/products', {
      method: 'POST',
      token,
      body: {
        name: `E2E Ürün ${String(index)}`,
        unitId,
        salePrice: `1${String(index)}.50`,
        vatRate: 20,
        barcodes: [`8699${randomUUID().replace(/\D/g, '').slice(0, 9).padEnd(9, '0')}`],
      },
    });
  }

  return { email, password, token, registerId, unitId };
}

export async function addProduct(tenant: TestTenant, name: string): Promise<string> {
  const product = await call<{ id: string }>('/products', {
    method: 'POST',
    token: tenant.token,
    body: { name, unitId: tenant.unitId, salePrice: '99.00', vatRate: 20 },
  });
  return product.id;
}

/** Sunucudaki satışlar — "tek kopya" doğrulaması bunun üzerinden yapılır. */
export interface ServerSale {
  id: string;
  receiptNo: string | null;
  grandTotal: string;
  clientSaleId?: string | null;
}

export async function listSales(tenant: TestTenant): Promise<ServerSale[]> {
  const page = await call<{ items: ServerSale[] }>('/sales?limit=50&sort=soldAt:desc', {
    token: tenant.token,
  });
  return page.items;
}

/** Ürünü barkoduyla birlikte döner — satış ekranı barkodu okutabilsin. */
export async function seedBarcodedProduct(
  tenant: TestTenant,
  name: string,
  salePrice: string,
  barcode: string,
): Promise<{ id: string; barcode: string }> {
  const product = await call<{ id: string }>('/products', {
    method: 'POST',
    token: tenant.token,
    body: { name, unitId: tenant.unitId, salePrice, vatRate: 20, barcodes: [barcode] },
  });
  return { id: product.id, barcode };
}

/** Tenant ayarındaki terazi barkodu prefix'lerini günceller. */
export async function setScalePrefixes(
  tenant: TestTenant,
  prefixes: readonly string[],
): Promise<void> {
  await call('/settings', {
    method: 'PATCH',
    token: tenant.token,
    body: { scaleBarcodePrefixes: [...prefixes] },
  });
}
