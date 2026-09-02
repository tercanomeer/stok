import { Module } from '@nestjs/common';

import { ContactLedgerService } from './contact-ledger.service.js';
import { ContactService } from './contact.service.js';
import { ContactsController } from './contacts.controller.js';

@Module({
  controllers: [ContactsController],
  providers: [ContactService, ContactLedgerService],
  exports: [ContactService],
})
export class ContactsModule {}
