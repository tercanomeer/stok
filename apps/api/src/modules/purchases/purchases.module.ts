import { Module } from '@nestjs/common';

import { PurchaseService } from './purchase.service.js';
import { PurchasesController } from './purchases.controller.js';
import { ContactsModule } from '../contacts/contacts.module.js';
import { StockModule } from '../stock/stock.module.js';

@Module({
  imports: [StockModule, ContactsModule],
  controllers: [PurchasesController],
  providers: [PurchaseService],
})
export class PurchasesModule {}
