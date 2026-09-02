import { Module } from '@nestjs/common';

import { RegisterService } from './register.service.js';
import { RegistersController } from './registers.controller.js';

@Module({
  controllers: [RegistersController],
  providers: [RegisterService],
  exports: [RegisterService],
})
export class RegistersModule {}
