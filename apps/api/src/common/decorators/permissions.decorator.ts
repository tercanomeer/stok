import { SetMetadata } from '@nestjs/common';

import type { Permission } from '@stokk/types';

export const PERMISSIONS_KEY = 'stokk:permissions';

/**
 * Endpoint'in gerektirdiği izinler — CLAUDE.md "Korumalı her endpoint'te @Permissions()".
 * Birden fazla verilirse hepsi gereklidir (AND).
 */
export const Permissions = (...permissions: Permission[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSIONS_KEY, permissions);
