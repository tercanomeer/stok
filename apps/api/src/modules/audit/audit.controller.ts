import { Controller, Get, Query } from '@nestjs/common';

import { PERMISSIONS } from '@stokk/types';

import { AuditService } from './audit.service.js';
import { listAuditLogsSchema, type ListAuditLogsInput } from './dto/audit.dto.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Permissions(PERMISSIONS.AUDIT_LOG_VIEW)
  list(@Query(new ZodValidationPipe(listAuditLogsSchema)) query: ListAuditLogsInput) {
    return this.audit.list(query);
  }
}
