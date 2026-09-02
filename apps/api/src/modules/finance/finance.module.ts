import { Module } from '@nestjs/common';

import { FinanceController } from './finance.controller.js';
import { FinanceService } from './finance.service.js';
import { CashSessionsModule } from '../cash-sessions/cash-sessions.module.js';

@Module({
  imports: [CashSessionsModule],
  controllers: [FinanceController],
  providers: [FinanceService],
})
export class FinanceModule {}
