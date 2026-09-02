import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ExportController } from './export.controller.js';
import { ExportProcessor } from './export.processor.js';
import { EXPORT_QUEUE, ExportService } from './export.service.js';
import { ReportsModule } from '../reports/reports.module.js';

@Module({
  imports: [ReportsModule, BullModule.registerQueue({ name: EXPORT_QUEUE })],
  controllers: [ExportController],
  providers: [ExportService, ExportProcessor],
})
export class ExportModule {}
