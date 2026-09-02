import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';

import { PERMISSIONS } from '@stokk/types';

import {
  createRegisterSchema,
  updateRegisterSchema,
  type CreateRegisterInput,
  type UpdateRegisterInput,
} from './dto/register.dto.js';
import { RegisterService } from './register.service.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';

@Controller('registers')
export class RegistersController {
  constructor(private readonly registers: RegisterService) {}

  @Get()
  @Permissions(PERMISSIONS.CASH_SESSION_OPEN)
  list() {
    return this.registers.list();
  }

  @Get(':id')
  @Permissions(PERMISSIONS.CASH_SESSION_OPEN)
  findOne(@Param('id') id: string) {
    return this.registers.findOne(id);
  }

  @Post()
  @Permissions(PERMISSIONS.REGISTER_MANAGE)
  create(@Body(new ZodValidationPipe(createRegisterSchema)) body: CreateRegisterInput) {
    return this.registers.create(body);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.REGISTER_MANAGE)
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRegisterSchema)) body: UpdateRegisterInput,
  ) {
    return this.registers.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @Permissions(PERMISSIONS.REGISTER_MANAGE)
  async remove(@Param('id') id: string): Promise<void> {
    await this.registers.remove(id);
  }
}
