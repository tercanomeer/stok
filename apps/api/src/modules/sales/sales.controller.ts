import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';

import { PERMISSIONS } from '@stokk/types';

import { SaleService } from './sale.service.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import {
  completeParkedSchema,
  createSaleSchema,
  listSalesSchema,
  parkSaleSchema,
  returnSaleSchema,
  type CompleteParkedInput,
  type CreateSaleInput,
  type ListSalesInput,
  type ParkSaleInput,
  type ReturnSaleInput,
} from './dto/sale.dto.js';

@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SaleService) {}

  @Get()
  @Permissions(PERMISSIONS.SALE_VIEW)
  list(@Query(new ZodValidationPipe(listSalesSchema)) query: ListSalesInput) {
    return this.sales.list(query);
  }

  // ':id' rotasından ÖNCE — yoksa 'returns' bir id sanılır.
  @Get('returns/:id')
  @Permissions(PERMISSIONS.SALE_VIEW)
  getReturn(@Param('id') id: string) {
    return this.sales.getReturn(id);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.SALE_VIEW)
  findOne(@Param('id') id: string) {
    return this.sales.findOne(id);
  }

  @Get(':id/receipt')
  @Permissions(PERMISSIONS.SALE_VIEW)
  receipt(@Param('id') id: string) {
    return this.sales.receipt(id);
  }

  @Post()
  @Permissions(PERMISSIONS.SALE_CREATE)
  create(
    @Body(new ZodValidationPipe(createSaleSchema)) body: CreateSaleInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sales.create(body, user);
  }

  @Post('park')
  @Permissions(PERMISSIONS.SALE_CREATE)
  park(
    @Body(new ZodValidationPipe(parkSaleSchema)) body: ParkSaleInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sales.park(body, user);
  }

  @Post(':id/complete')
  @Permissions(PERMISSIONS.SALE_CREATE)
  complete(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(completeParkedSchema)) body: CompleteParkedInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sales.completeParked(id, body, user);
  }

  @Post(':id/cancel')
  @HttpCode(204)
  @Permissions(PERMISSIONS.SALE_CANCEL)
  async cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.sales.cancel(id, user);
  }

  @Post(':id/returns')
  @Permissions(PERMISSIONS.SALE_RETURN)
  createReturn(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(returnSaleSchema)) body: ReturnSaleInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sales.createReturn(id, body, user);
  }
}
