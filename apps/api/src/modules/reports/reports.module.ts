import { Module } from '@nestjs/common';

import { ReportService } from './report.service.js';
import { ReportsController } from './reports.controller.js';
import { ContactsModule } from '../contacts/contacts.module.js';

@Module({
  imports: [ContactsModule],
  controllers: [ReportsController],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportsModule {}
