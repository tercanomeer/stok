import { Module } from '@nestjs/common';

import { SaleService } from './sale.service.js';
import { SalesController } from './sales.controller.js';
import { SequenceService } from './sequence.service.js';
import { CashSessionsModule } from '../cash-sessions/cash-sessions.module.js';
import { ContactsModule } from '../contacts/contacts.module.js';
import { StockModule } from '../stock/stock.module.js';

@Module({
  imports: [StockModule, ContactsModule, CashSessionsModule],
  controllers: [SalesController],
  providers: [SaleService, SequenceService],
  exports: [SaleService],
})
export class SalesModule {}
