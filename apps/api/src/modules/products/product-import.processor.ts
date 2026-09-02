import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

import {
  PRODUCT_IMPORT_QUEUE,
  ProductImportService,
  type ProductImportJobData,
} from './product-import.service.js';

/**
 * Import worker'ı API ile aynı süreçte çalışır (bu ölçekte ayrı worker gereksiz).
 * İş kaydı ve satır işleme ProductImportService içinde.
 */
@Processor(PRODUCT_IMPORT_QUEUE)
export class ProductImportProcessor extends WorkerHost {
  constructor(private readonly service: ProductImportService) {
    super();
  }

  async process(job: Job<ProductImportJobData>): Promise<void> {
    await this.service.process(job.data);
  }
}
