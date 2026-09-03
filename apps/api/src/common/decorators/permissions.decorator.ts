import { SetMetadata } from '@nestjs/common';

import type { Permission } from '@stokk/types';

export const PERMISSIONS_KEY = 'stokk:permissions';

/**
 * Endpoint'in gerektirdiği izinler — CLAUDE.md "Korumalı her endpoint'te @Permissions()".
 * Birden fazla verilirse hepsi gereklidir (AND).
 */
export const Permissions = (...permissions: Permission[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const NO_PERMISSION_KEY = 'stokk:noPermissionRequired';

/**
 * Kimliği doğrulanmış HERKESE açık endpoint — izin gerektirmediği BİLEREK
 * işaretlenir (ör. `/auth/me`: kullanıcı yalnız kendi profilini okur).
 *
 * Guard varsayılanı kapalıdır: `@Permissions()` veya bu decorator yoksa istek
 * reddedilir. Böylece decorator eklemeyi unutmak sessiz bir açık değil, görünür
 * bir hata üretir (security-auditor bulgusu).
 */
export const NoPermissionRequired = (): MethodDecorator & ClassDecorator =>
  SetMetadata(NO_PERMISSION_KEY, true);
