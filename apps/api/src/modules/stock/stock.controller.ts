import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';

import { PERMISSIONS } from '@stokk/types';

import {
  addCountItemSchema,
  adjustSchema,
  listMovementsSchema,
  startCountSchema,
  wasteSchema,
  type AddCountItemInput,
  type AdjustInput,
  type ListMovementsInput,
  type StartCountInput,
  type WasteInput,
} from './dto/stock.dto.js';
import { StockCountService } from './stock-count.service.js';
import { StockService } from './stock.service.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';

@Controller('stock')
export class StockController {
  constructor(
    private readonly stock: StockService,
    private readonly counts: StockCountService,
  ) {}

  @Get('movements')
  @Permissions(PERMISSIONS.STOCK_VIEW)
  listMovements(@Query(new ZodValidationPipe(listMovementsSchema)) query: ListMovementsInput) {
    return this.stock.listMovements(query);
  }

  @Get('low')
  @Permissions(PERMISSIONS.STOCK_VIEW)
  lowStock() {
    return this.stock.lowStock();
  }

  @Post('waste')
  @Permissions(PERMISSIONS.STOCK_WASTE)
  waste(
    @Body(new ZodValidationPipe(wasteSchema)) body: WasteInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.stock.recordWaste(body.productId, body.quantity, body.reason, user.id);
  }

  @Post('adjust')
  @Permissions(PERMISSIONS.STOCK_ADJUST)
  adjust(
    @Body(new ZodValidationPipe(adjustSchema)) body: AdjustInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.stock.adjust(body.productId, body.newQuantity, body.reason, user.id);
  }

  // --- Sayım ---
  @Get('counts')
  @Permissions(PERMISSIONS.STOCK_COUNT)
  listCounts() {
    return this.counts.list();
  }

  @Get('counts/:id')
  @Permissions(PERMISSIONS.STOCK_COUNT)
  findCount(@Param('id') id: string) {
    return this.counts.findOne(id);
  }

  @Post('counts')
  @Permissions(PERMISSIONS.STOCK_COUNT)
  startCount(
    @Body(new ZodValidationPipe(startCountSchema)) body: StartCountInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.counts.start(body.note, user.id);
  }

  @Post('counts/:id/items')
  @Permissions(PERMISSIONS.STOCK_COUNT)
  addItem(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addCountItemSchema)) body: AddCountItemInput,
  ) {
    return this.counts.addItem(id, body.product, body.quantity);
  }

  @Post('counts/:id/complete')
  @Permissions(PERMISSIONS.STOCK_COUNT)
  completeCount(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.counts.complete(id, user.id);
  }

  @Post('counts/:id/cancel')
  @HttpCode(204)
  @Permissions(PERMISSIONS.STOCK_COUNT)
  async cancelCount(@Param('id') id: string): Promise<void> {
    await this.counts.cancel(id);
  }
}
