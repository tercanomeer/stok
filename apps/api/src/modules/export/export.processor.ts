import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

import { EXPORT_QUEUE, ExportService, type ExportJobData } from './export.service.js';

/** Export worker'ı API ile aynı süreçte (bu ölçekte ayrı worker gereksiz). */
@Processor(EXPORT_QUEUE)
export class ExportProcessor extends WorkerHost {
  constructor(private readonly service: ExportService) {
    super();
  }

  async process(job: Job<ExportJobData>): Promise<void> {
    await this.service.process(job.data);
  }
}
