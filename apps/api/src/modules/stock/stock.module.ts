import { Module } from '@nestjs/common';

import { StockCountService } from './stock-count.service.js';
import { StockLowListener } from './stock-low.listener.js';
import { StockController } from './stock.controller.js';
import { StockService } from './stock.service.js';

@Module({
  controllers: [StockController],
  providers: [StockService, StockCountService, StockLowListener],
  exports: [StockService],
})
export class StockModule {}
