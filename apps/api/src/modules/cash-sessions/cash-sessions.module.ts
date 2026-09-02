import { Module } from '@nestjs/common';

import { CashSessionService } from './cash-session.service.js';
import { CashSessionsController } from './cash-sessions.controller.js';

@Module({
  controllers: [CashSessionsController],
  providers: [CashSessionService],
  exports: [CashSessionService],
})
export class CashSessionsModule {}
