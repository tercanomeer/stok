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

import {
  createUserSchema,
  updateUserSchema,
  type CreateUserInput,
  type UpdateUserInput,
} from './dto/user.dto.js';
import { UsersService } from './users.service.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Permissions(PERMISSIONS.USER_VIEW)
  async list() {
    return this.users.list();
  }

  @Get(':id')
  @Permissions(PERMISSIONS.USER_VIEW)
  async findOne(@Param('id') id: string) {
    return this.users.findOne(id);
  }

  @Post()
  @Permissions(PERMISSIONS.USER_MANAGE)
  @UsePipes(new ZodValidationPipe(createUserSchema))
  async create(@Body() body: CreateUserInput) {
    return this.users.create(body);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.USER_MANAGE)
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserInput,
  ) {
    return this.users.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @Permissions(PERMISSIONS.USER_MANAGE)
  async deactivate(@Param('id') id: string): Promise<void> {
    await this.users.deactivate(id);
  }
}
