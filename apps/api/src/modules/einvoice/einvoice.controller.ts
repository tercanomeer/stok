import { Controller, Get, Header, Param, Post, Query, StreamableFile } from '@nestjs/common';

import { PERMISSIONS } from '@stokk/types';

import { listEInvoicesSchema, type ListEInvoicesInput } from './dto/einvoice.dto.js';
import { EInvoiceService } from './einvoice.service.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';

@Controller('e-invoices')
export class EInvoiceController {
  constructor(private readonly einvoices: EInvoiceService) {}

  @Get()
  @Permissions(PERMISSIONS.EINVOICE_VIEW)
  list(@Query(new ZodValidationPipe(listEInvoicesSchema)) query: ListEInvoicesInput) {
    return this.einvoices.list(query);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.EINVOICE_VIEW)
  findOne(@Param('id') id: string) {
    return this.einvoices.findOne(id);
  }

  @Get(':id/pdf')
  @Permissions(PERMISSIONS.EINVOICE_VIEW)
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="e-fatura.pdf"')
  async pdf(@Param('id') id: string): Promise<StreamableFile> {
    return new StreamableFile(await this.einvoices.getPdf(id));
  }

  @Post('from-sale/:saleId')
  @Permissions(PERMISSIONS.EINVOICE_SEND)
  createFromSale(@Param('saleId') saleId: string) {
    return this.einvoices.createFromSale(saleId);
  }

  @Post(':id/send')
  @Permissions(PERMISSIONS.EINVOICE_SEND)
  send(@Param('id') id: string) {
    return this.einvoices.send(id);
  }

  @Post(':id/refresh')
  @Permissions(PERMISSIONS.EINVOICE_SEND)
  refresh(@Param('id') id: string) {
    return this.einvoices.refreshStatus(id);
  }

  @Post(':id/cancel')
  @Permissions(PERMISSIONS.EINVOICE_SEND)
  cancel(@Param('id') id: string) {
    return this.einvoices.cancel(id);
  }
}
