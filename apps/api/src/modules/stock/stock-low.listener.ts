import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { STOCK_LOW_EVENT, type StockLowEvent } from './stock.events.js';

/**
 * `stock.low` event tüketicisi. Şimdilik yalnız log; Faz 8 dashboard'u ve Faz 12
 * POS bildirim kanalı bu event'i kullanacak (Socket.IO push).
 */
@Injectable()
export class StockLowListener {
  private readonly logger = new Logger('StockLow');

  @OnEvent(STOCK_LOW_EVENT)
  handle(event: StockLowEvent): void {
    this.logger.warn(
      `Kritik stok: ${event.productName} (${event.stockQuantity}/${event.criticalLevel}) tenant ${event.tenantId}`,
    );
  }
}
