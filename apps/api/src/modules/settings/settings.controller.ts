import { Body, Controller, Get, Patch } from '@nestjs/common';

import { PERMISSIONS } from '@stokk/types';

import { updateSettingsSchema, type UpdateSettingsInput } from './dto/settings.dto.js';
import { SettingsService } from './settings.service.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @Permissions(PERMISSIONS.SETTINGS_MANAGE)
  get() {
    return this.settings.get();
  }

  @Patch()
  @Permissions(PERMISSIONS.SETTINGS_MANAGE)
  update(@Body(new ZodValidationPipe(updateSettingsSchema)) body: UpdateSettingsInput) {
    return this.settings.update(body);
  }
}
