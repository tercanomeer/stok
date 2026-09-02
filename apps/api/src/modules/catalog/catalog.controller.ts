import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UsePipes,
} from '@nestjs/common';

import { PERMISSIONS } from '@stokk/types';

import { CatalogService } from './catalog.service.js';
import {
  createBrandSchema,
  createCategorySchema,
  createUnitSchema,
  updateBrandSchema,
  updateCategorySchema,
  updateUnitSchema,
  type CreateBrandInput,
  type CreateCategoryInput,
  type CreateUnitInput,
  type UpdateBrandInput,
  type UpdateCategoryInput,
  type UpdateUnitInput,
} from './dto/catalog.dto.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';

@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  // --- Kategori ---
  @Get('categories')
  @Permissions(PERMISSIONS.PRODUCT_VIEW)
  listCategories() {
    return this.catalog.listCategories();
  }

  @Post('categories')
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  @UsePipes(new ZodValidationPipe(createCategorySchema))
  createCategory(@Body() body: CreateCategoryInput) {
    return this.catalog.createCategory(body);
  }

  @Patch('categories/:id')
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  updateCategory(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) body: UpdateCategoryInput,
  ) {
    return this.catalog.updateCategory(id, body);
  }

  @Delete('categories/:id')
  @HttpCode(204)
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  async removeCategory(@Param('id') id: string): Promise<void> {
    await this.catalog.removeCategory(id);
  }

  // --- Marka ---
  @Get('brands')
  @Permissions(PERMISSIONS.PRODUCT_VIEW)
  listBrands() {
    return this.catalog.listBrands();
  }

  @Post('brands')
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  @UsePipes(new ZodValidationPipe(createBrandSchema))
  createBrand(@Body() body: CreateBrandInput) {
    return this.catalog.createBrand(body);
  }

  @Patch('brands/:id')
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  updateBrand(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateBrandSchema)) body: UpdateBrandInput,
  ) {
    return this.catalog.updateBrand(id, body);
  }

  @Delete('brands/:id')
  @HttpCode(204)
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  async removeBrand(@Param('id') id: string): Promise<void> {
    await this.catalog.removeBrand(id);
  }

  // --- Birim ---
  @Get('units')
  @Permissions(PERMISSIONS.PRODUCT_VIEW)
  listUnits() {
    return this.catalog.listUnits();
  }

  @Post('units')
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  @UsePipes(new ZodValidationPipe(createUnitSchema))
  createUnit(@Body() body: CreateUnitInput) {
    return this.catalog.createUnit(body);
  }

  @Patch('units/:id')
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  updateUnit(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUnitSchema)) body: UpdateUnitInput,
  ) {
    return this.catalog.updateUnit(id, body);
  }

  @Delete('units/:id')
  @HttpCode(204)
  @Permissions(PERMISSIONS.CATALOG_MANAGE)
  async removeUnit(@Param('id') id: string): Promise<void> {
    await this.catalog.removeUnit(id);
  }
}
