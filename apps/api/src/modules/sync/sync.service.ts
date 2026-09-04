import { Injectable } from '@nestjs/common';

import { DomainError } from '../../common/errors/domain-error.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import { SaleService } from '../sales/sale.service.js';
import type { PullQueryInput, PushSalesInput } from './dto/sync.dto.js';

interface PushResult {
  clientSaleId: string | null;
  status: 'created' | 'duplicate' | 'error';
  saleId?: string;
  receiptNo?: string;
  error?: { code: string; message: string };
}

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: SaleService,
  ) {}

  /**
   * POS'un offline çalışması için katalog çekişi. `since` verilirse yalnız o andan sonra
   * değişen ürünler döner (delta sync); server zamanı bir sonraki pull için döndürülür.
   */
  async pull(query: PullQueryInput) {
    const since = query.since ? new Date(query.since) : undefined;
    return this.prisma.withTenant(async (tx) => {
      const products = await tx.product.findMany({
        where: {
          deletedAt: null,
          ...(since ? { updatedAt: { gt: since } } : {}),
        },
        select: {
          id: true,
          name: true,
          salePrice: true,
          vatRate: true,
          stockQuantity: true,
          trackStock: true,
          isActive: true,
          unitId: true,
          updatedAt: true,
          barcodes: { select: { value: true } },
        },
        orderBy: { updatedAt: 'asc' },
      });
      // POS satış ekranının çevrimdışıyken de ihtiyaç duyduğu ayarlar. MALİYET
      // ALANI YOK ve olmayacak: kasa PC'si çalınırsa alış fiyatı sızmamalı.
      const settings = await tx.tenantSettings.findFirst({
        select: {
          vatRates: true,
          defaultVatRate: true,
          scaleBarcodePrefixes: true,
          currency: true,
          // İndirim yetkisi kapısı kasada da uygulanır; sunucu yine doğrular.
          highDiscountThreshold: true,
          negativeStockPolicy: true,
          receiptHeader: true,
          receiptFooter: true,
        },
      });
      return { serverTime: new Date().toISOString(), products, settings };
    });
  }

  /**
   * Offline biriken satışları toplu, IDEMPOTENT gönderim (at-least-once). Her satış kendi
   * transaction'ında işlenir; biri hata verirse diğerleri etkilenmez, sonuç kalem kalem döner.
   */
  async pushSales(
    input: PushSalesInput,
    user: AuthenticatedUser,
  ): Promise<{ results: PushResult[] }> {
    const results: PushResult[] = [];
    for (const sale of input.sales) {
      try {
        let existed = false;
        if (sale.clientSaleId) {
          const clientSaleId = sale.clientSaleId;
          const dup = await this.prisma.withTenant((tx) =>
            tx.sale.findFirst({ where: { clientSaleId }, select: { id: true } }),
          );
          existed = dup !== null;
        }
        const created = await this.sales.create(sale, user);
        results.push({
          clientSaleId: sale.clientSaleId ?? null,
          status: existed ? 'duplicate' : 'created',
          saleId: created.id,
          receiptNo: created.receiptNo,
        });
      } catch (error) {
        results.push({
          clientSaleId: sale.clientSaleId ?? null,
          status: 'error',
          error:
            error instanceof DomainError
              ? { code: error.code, message: error.message }
              : { code: 'UNKNOWN', message: 'Bilinmeyen hata' },
        });
      }
    }
    return { results };
  }
}
