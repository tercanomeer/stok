import { Module } from '@nestjs/common';

import { SyncController } from './sync.controller.js';
import { SyncService } from './sync.service.js';
import { SalesModule } from '../sales/sales.module.js';

@Module({
  imports: [SalesModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
