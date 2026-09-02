import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';

import { PERMISSIONS } from '@stokk/types';

import { ContactLedgerService } from './contact-ledger.service.js';
import { ContactService } from './contact.service.js';
import {
  createContactSchema,
  listContactsSchema,
  paymentSchema,
  statementSchema,
  updateContactSchema,
  type CreateContactInput,
  type ListContactsInput,
  type PaymentInput,
  type StatementInput,
  type UpdateContactInput,
} from './dto/contact.dto.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';

@Controller('contacts')
export class ContactsController {
  constructor(
    private readonly contacts: ContactService,
    private readonly ledger: ContactLedgerService,
  ) {}

  @Get()
  @Permissions(PERMISSIONS.CONTACT_VIEW)
  list(@Query(new ZodValidationPipe(listContactsSchema)) query: ListContactsInput) {
    return this.contacts.list(query);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.CONTACT_VIEW)
  findOne(@Param('id') id: string) {
    return this.contacts.findOne(id);
  }

  @Get(':id/statement')
  @Permissions(PERMISSIONS.CONTACT_VIEW)
  statement(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(statementSchema)) query: StatementInput,
  ) {
    return this.ledger.statement(id, query);
  }

  @Get(':id/statement.xlsx')
  @Permissions(PERMISSIONS.CONTACT_VIEW)
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="ekstre.xlsx"')
  async statementExcel(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(statementSchema)) query: StatementInput,
  ): Promise<StreamableFile> {
    return new StreamableFile(await this.ledger.statementExcel(id, query));
  }

  @Get(':id/aging')
  @Permissions(PERMISSIONS.CONTACT_VIEW)
  aging(@Param('id') id: string) {
    return this.ledger.aging(id);
  }

  @Post()
  @Permissions(PERMISSIONS.CONTACT_MANAGE)
  create(@Body(new ZodValidationPipe(createContactSchema)) body: CreateContactInput) {
    return this.contacts.create(body);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.CONTACT_MANAGE)
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateContactSchema)) body: UpdateContactInput,
  ) {
    return this.contacts.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @Permissions(PERMISSIONS.CONTACT_MANAGE)
  async remove(@Param('id') id: string): Promise<void> {
    await this.contacts.remove(id);
  }

  @Post('payments')
  @Permissions(PERMISSIONS.CONTACT_TRANSACTION_MANAGE)
  payment(@Body(new ZodValidationPipe(paymentSchema)) body: PaymentInput) {
    return this.ledger.recordPayment(body);
  }
}
