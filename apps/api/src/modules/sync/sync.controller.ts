import { Body, Controller, Get, Post, Query } from '@nestjs/common';

import { PERMISSIONS } from '@stokk/types';

import { SyncService } from './sync.service.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import {
  pullQuerySchema,
  pushSalesSchema,
  type PullQueryInput,
  type PushSalesInput,
} from './dto/sync.dto.js';

@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get('pull')
  @Permissions(PERMISSIONS.SALE_CREATE)
  pull(@Query(new ZodValidationPipe(pullQuerySchema)) query: PullQueryInput) {
    return this.sync.pull(query);
  }

  @Post('sales')
  @Permissions(PERMISSIONS.SALE_CREATE)
  pushSales(
    @Body(new ZodValidationPipe(pushSalesSchema)) body: PushSalesInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sync.pushSales(body, user);
  }
}
