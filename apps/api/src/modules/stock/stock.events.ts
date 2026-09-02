/** Domain event isimleri — 03-mimari.md "Event". Süreç içi EventEmitter2. */
export const STOCK_LOW_EVENT = 'stock.low';

export interface StockLowEvent {
  tenantId: string;
  productId: string;
  productName: string;
  stockQuantity: string;
  criticalLevel: string;
}
