import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';

import { PERMISSIONS } from '@stokk/types';

import { PurchaseService } from './purchase.service.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import {
  createPurchaseSchema,
  listPurchasesSchema,
  type CreatePurchaseInput,
  type ListPurchasesInput,
} from './dto/purchase.dto.js';

@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchases: PurchaseService) {}

  @Get()
  @Permissions(PERMISSIONS.PURCHASE_VIEW)
  list(@Query(new ZodValidationPipe(listPurchasesSchema)) query: ListPurchasesInput) {
    return this.purchases.list(query);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.PURCHASE_VIEW)
  findOne(@Param('id') id: string) {
    return this.purchases.findOne(id);
  }

  @Post()
  @Permissions(PERMISSIONS.PURCHASE_MANAGE)
  create(
    @Body(new ZodValidationPipe(createPurchaseSchema)) body: CreatePurchaseInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.purchases.create(body, user.id);
  }

  @Post(':id/cancel')
  @HttpCode(204)
  @Permissions(PERMISSIONS.PURCHASE_CANCEL)
  async cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.purchases.cancel(id, user.id);
  }
}
