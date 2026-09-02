import { Body, Controller, Get, Param, Post } from '@nestjs/common';

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
}
