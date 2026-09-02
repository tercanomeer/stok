import { Module } from '@nestjs/common';

import { EInvoiceController } from './einvoice.controller.js';
import { EInvoiceService } from './einvoice.service.js';
import { EINVOICE_PROVIDER } from './provider/einvoice-provider.js';
import { MockEInvoiceProvider } from './provider/mock-einvoice.provider.js';
import { MockOkcProvider } from './provider/mock-okc.provider.js';
import { OKC_PROVIDER } from './provider/okc-provider.js';

/**
 * Yasal adapter'lar mock ile bağlanıyor. Gerçek entegratör/ÖKC geldiğinde yalnız
 * useClass değişir; servis katmanı interface'e bağımlı.
 */
@Module({
  controllers: [EInvoiceController],
  providers: [
    EInvoiceService,
    { provide: EINVOICE_PROVIDER, useClass: MockEInvoiceProvider },
    { provide: OKC_PROVIDER, useClass: MockOkcProvider },
  ],
  exports: [EInvoiceService, OKC_PROVIDER],
})
export class EInvoiceModule {}
