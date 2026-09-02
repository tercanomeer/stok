import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'stokk:isPublic';

/** Kimlik doğrulaması gerektirmeyen endpoint. Varsayılan korumalıdır. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
