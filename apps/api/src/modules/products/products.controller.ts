import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { PERMISSIONS } from '@stokk/types';

import {
  addBarcodeSchema,
  bulkLabelSchema,
  bulkPriceSchema,
  createProductSchema,
  listProductsSchema,
  updateProductSchema,
  type AddBarcodeInput,
  type BulkPriceInput,
  type CreateProductInput,
  type ListProductsInput,
  type UpdateProductInput,
} from './dto/product.dto.js';
import { ProductImportService } from './product-import.service.js';
import { ProductLabelService } from './product-label.service.js';
import { ProductsService } from './products.service.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { StorageService } from '../../storage/storage.service.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';

interface UploadedFileLike {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

@Controller('products')
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly imports: ProductImportService,
    private readonly labels: ProductLabelService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  @Permissions(PERMISSIONS.PRODUCT_VIEW)
  list(@Query(new ZodValidationPipe(listProductsSchema)) query: ListProductsInput) {
    return this.products.list(query);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.PRODUCT_VIEW)
  findOne(@Param('id') id: string) {
    return this.products.findOne(id);
  }

  @Post()
  @Permissions(PERMISSIONS.PRODUCT_MANAGE)
  @UsePipes(new ZodValidationPipe(createProductSchema))
  create(@Body() body: CreateProductInput) {
    return this.products.create(body);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.PRODUCT_MANAGE)
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProductSchema)) body: UpdateProductInput,
  ) {
    return this.products.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @Permissions(PERMISSIONS.PRODUCT_DELETE)
  async remove(@Param('id') id: string): Promise<void> {
    await this.products.remove(id);
  }

  // --- Barkod ---
  @Post(':id/barcodes')
  @Permissions(PERMISSIONS.PRODUCT_MANAGE)
  addBarcode(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addBarcodeSchema)) body: AddBarcodeInput,
  ) {
    return this.products.addBarcode(id, body);
  }

  @Delete(':id/barcodes/:barcodeId')
  @HttpCode(204)
  @Permissions(PERMISSIONS.PRODUCT_MANAGE)
  async removeBarcode(
    @Param('id') id: string,
    @Param('barcodeId') barcodeId: string,
  ): Promise<void> {
    await this.products.removeBarcode(id, barcodeId);
  }

  // --- Toplu fiyat ---
  @Post('bulk-price')
  @Permissions(PERMISSIONS.PRODUCT_PRICE_BULK_UPDATE)
  bulkPrice(@Body(new ZodValidationPipe(bulkPriceSchema)) body: BulkPriceInput) {
    return this.products.bulkPrice(body);
  }

  // --- Etiket ---
  @Post('labels')
  @Permissions(PERMISSIONS.PRODUCT_VIEW)
  generateLabels(
    @Body(new ZodValidationPipe(bulkLabelSchema)) body: { productIds: string[] },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.labels.generate(body.productIds, user.tenantId);
  }

  // --- Görsel yükleme ---
  @Post(':id/image')
  @HttpCode(200)
  @Permissions(PERMISSIONS.PRODUCT_MANAGE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadImage(
    @Param('id') id: string,
    @UploadedFile() file: UploadedFileLike | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('Dosya gönderilmedi.');
    // Ürün var mı önce kontrol edilir; yoksa S3'e öksüz nesne yüklenmez.
    // MIME/boyut doğrulaması StorageService içinde ValidationError olarak fırlar.
    await this.products.findOne(id);
    const url = await this.storage.uploadProductImage(user.tenantId, file);
    return this.products.update(id, { imageUrl: url });
  }

  // --- Excel import ---
  @Post('import')
  @Permissions(PERMISSIONS.PRODUCT_IMPORT)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async importExcel(
    @UploadedFile() file: UploadedFileLike | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('Excel dosyası gönderilmedi.');
    const jobId = await this.imports.enqueue(
      user.tenantId,
      user.id,
      file.originalname,
      file.buffer,
    );
    return { jobId };
  }

  @Get('import/:jobId')
  @Permissions(PERMISSIONS.PRODUCT_IMPORT)
  importStatus(@Param('jobId') jobId: string) {
    return this.imports.getStatus(jobId);
  }
}
