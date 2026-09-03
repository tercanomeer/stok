import { Module } from '@nestjs/common';

import { SecretCipher } from './secret-cipher.js';
import { SettingsController } from './settings.controller.js';
import { SettingsService } from './settings.service.js';
import { AuditModule } from '../audit/audit.module.js';

@Module({
  imports: [AuditModule],
  controllers: [SettingsController],
  providers: [SettingsService, SecretCipher],
})
export class SettingsModule {}
