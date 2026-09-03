import { Body, Controller, Get, Header, Param, Post, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';

import { PERMISSIONS } from '@stokk/types';

import { ExportService } from './export.service.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import { createExportSchema, type CreateExportInput } from './dto/export.dto.js';

@Controller('exports')
export class ExportController {
  constructor(private readonly exports: ExportService) {}

  @Post()
  @Permissions(PERMISSIONS.REPORT_EXPORT)
  create(
    @Body(new ZodValidationPipe(createExportSchema)) body: CreateExportInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.exports.enqueue(body, user);
  }

  @Get(':jobId')
  @Permissions(PERMISSIONS.REPORT_EXPORT)
  status(@Param('jobId') jobId: string) {
    return this.exports.getStatus(jobId);
  }

  /**
   * Hazır rapor dosyasını indirir. Nesne deposu özel olduğu için dosya
   * doğrudan adresle açılamaz; indirme yetki kontrolünden geçer.
   */
  @Get(':jobId/file')
  @Permissions(PERMISSIONS.REPORT_EXPORT)
  @Header('Cache-Control', 'no-store')
  async file(
    @Param('jobId') jobId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { body, fileName, contentType } = await this.exports.downloadFile(jobId);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return new StreamableFile(body);
  }
}
