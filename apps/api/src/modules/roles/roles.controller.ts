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
  createRoleSchema,
  updateRoleSchema,
  type CreateRoleInput,
  type UpdateRoleInput,
} from './dto/role.dto.js';
import { RolesService } from './roles.service.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';

@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @Permissions(PERMISSIONS.ROLE_MANAGE)
  async list() {
    return this.roles.list();
  }

  @Get('permissions')
  @Permissions(PERMISSIONS.ROLE_MANAGE)
  async catalog() {
    return this.roles.permissionCatalog();
  }

  @Post()
  @Permissions(PERMISSIONS.ROLE_MANAGE)
  @UsePipes(new ZodValidationPipe(createRoleSchema))
  async create(@Body() body: CreateRoleInput) {
    return this.roles.create(body);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.ROLE_MANAGE)
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRoleSchema)) body: UpdateRoleInput,
  ) {
    return this.roles.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @Permissions(PERMISSIONS.ROLE_MANAGE)
  async remove(@Param('id') id: string): Promise<void> {
    await this.roles.remove(id);
  }
}
