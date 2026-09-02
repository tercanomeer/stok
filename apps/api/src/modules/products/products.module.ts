import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ProductImportProcessor } from './product-import.processor.js';
import { ProductImportService, PRODUCT_IMPORT_QUEUE } from './product-import.service.js';
import { ProductLabelService } from './product-label.service.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

@Module({
  imports: [BullModule.registerQueue({ name: PRODUCT_IMPORT_QUEUE })],
  controllers: [ProductsController],
  providers: [ProductsService, ProductImportService, ProductImportProcessor, ProductLabelService],
  exports: [ProductsService],
})
export class ProductsModule {}
