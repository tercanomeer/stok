import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

import { PERMISSIONS } from '@stokk/types';

import { CashSessionService } from './cash-session.service.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import {
  cashMovementSchema,
  closeSessionSchema,
  openSessionSchema,
  type CashMovementInput,
  type CloseSessionInput,
  type OpenSessionInput,
} from './dto/cash-session.dto.js';

@Controller('cash-sessions')
export class CashSessionsController {
  constructor(private readonly sessions: CashSessionService) {}

  @Get()
  @Permissions(PERMISSIONS.CASH_SESSION_VIEW_ALL)
  list(@Query('status') status?: 'OPEN' | 'CLOSED') {
    return this.sessions.list(status === 'OPEN' || status === 'CLOSED' ? status : undefined);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.CASH_SESSION_OPEN)
  findOne(@Param('id') id: string) {
    return this.sessions.findOne(id);
  }

  @Post()
  @Permissions(PERMISSIONS.CASH_SESSION_OPEN)
  open(
    @Body(new ZodValidationPipe(openSessionSchema)) body: OpenSessionInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sessions.open(body, user.id);
  }

  @Post(':id/movements')
  @Permissions(PERMISSIONS.CASH_MOVEMENT_MANAGE)
  addMovement(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cashMovementSchema)) body: CashMovementInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sessions.addMovement(id, body, user.id);
  }

  @Post(':id/close')
  @Permissions(PERMISSIONS.CASH_SESSION_CLOSE)
  close(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(closeSessionSchema)) body: CloseSessionInput,
  ) {
    return this.sessions.close(id, body);
  }
}
