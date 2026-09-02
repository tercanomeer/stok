import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import exceljs from 'exceljs';

import { Prisma } from '@stokk/db';

import { NotFoundError } from '../../common/errors/domain-error.js';
import { PrismaService, type TenantTransaction } from '../../prisma/prisma.service.js';

// exceljs CommonJS; ESM'de named import runtime'da patlıyor, default'tan alınıyor.
// eslint-disable-next-line import-x/no-named-as-default-member
const { Workbook } = exceljs;

export const PRODUCT_IMPORT_QUEUE = 'product-import';

export interface ProductImportJobData {
  jobId: string;
  tenantId: string;
  fileBase64: string;
}

interface RowError {
  row: number;
  message: string;
  field?: string;
}

interface ParsedRow {
  row: number;
  name: string;
  code?: string | undefined;
  unit: string;
  salePrice: string;
  vatRate: number;
  barcode?: string | undefined;
}

/**
 * Excel ürün import'u. Dosya kuyruğa alınır, worker satır satır işler:
 * her satır bağımsız — hatalı satır raporlanır, sağlam satırlar oluşur (kısmi başarı).
 */
@Injectable()
export class ProductImportService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(PRODUCT_IMPORT_QUEUE) private readonly queue: Queue<ProductImportJobData>,
  ) {}

  async enqueue(
    tenantId: string,
    userId: string,
    fileName: string,
    buffer: Buffer,
  ): Promise<string> {
    const job = await this.prisma.withTenant((tx, tid) =>
      tx.importJob.create({
        data: { tenantId: tid, type: 'PRODUCT', status: 'PENDING', fileName, createdById: userId },
        select: { id: true },
      }),
    );

    await this.queue.add('import', {
      jobId: job.id,
      tenantId,
      fileBase64: buffer.toString('base64'),
    });

    return job.id;
  }

  async getStatus(jobId: string) {
    const job = await this.prisma.withTenant((tx) =>
      tx.importJob.findFirst({ where: { id: jobId } }),
    );
    if (!job) throw new NotFoundError('İçe aktarma işi bulunamadı.');
    return job;
  }

  /** Worker'dan çağrılır — tenant bağlamı dışında, açık tenantId ile. */
  async process(data: ProductImportJobData): Promise<void> {
    const { jobId, tenantId } = data;
    const buffer = Buffer.from(data.fileBase64, 'base64');

    await this.prisma.withTenant(
      (tx) =>
        tx.importJob.update({
          where: { id: jobId },
          data: { status: 'PROCESSING', startedAt: new Date() },
        }),
      tenantId,
    );

    try {
      const { rows, parseErrors } = await this.parse(buffer);
      const errors: RowError[] = [...parseErrors];
      let created = 0;

      for (const row of rows) {
        try {
          await this.prisma.withTenant((tx) => this.insertRow(tx, tenantId, row), tenantId);
          created += 1;
        } catch (error: unknown) {
          errors.push({ row: row.row, message: this.errorMessage(error) });
        }
      }

      await this.prisma.withTenant(
        (tx) =>
          tx.importJob.update({
            where: { id: jobId },
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
              totalRows: rows.length + parseErrors.length,
              processedRows: rows.length,
              createdCount: created,
              errorCount: errors.length,
              errors: errors as unknown as Prisma.InputJsonValue,
            },
          }),
        tenantId,
      );
    } catch (error: unknown) {
      await this.prisma.withTenant(
        (tx) =>
          tx.importJob.update({
            where: { id: jobId },
            data: {
              status: 'FAILED',
              completedAt: new Date(),
              errors: [
                { row: 0, message: this.errorMessage(error) },
              ] as unknown as Prisma.InputJsonValue,
            },
          }),
        tenantId,
      );
    }
  }

  private async parse(buffer: Buffer): Promise<{ rows: ParsedRow[]; parseErrors: RowError[] }> {
    const workbook = new Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return { rows: [], parseErrors: [{ row: 0, message: 'Excel dosyası boş.' }] };

    const rows: ParsedRow[] = [];
    const parseErrors: RowError[] = [];

    // Başlık: Ad | Kod | Birim | Satış Fiyatı | KDV | Barkod (1. satır başlık).
    sheet.eachRow((excelRow, rowNumber) => {
      if (rowNumber === 1) return;

      const cell = (col: number): string => {
        // Excel hücresi metin/sayı ya da {result}/{text} nesnesi (formül/hyperlink) olabilir.
        const value = excelRow.getCell(col).value;
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') {
          const obj = value as { result?: unknown; text?: unknown };
          const inner = obj.result ?? obj.text;
          return typeof inner === 'string' || typeof inner === 'number' ? String(inner).trim() : '';
        }
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          return String(value).trim();
        }
        return '';
      };
      const name = cell(1);
      if (!name) return; // tamamen boş satır atlanır

      const salePriceRaw = cell(4).replace(',', '.');
      const vatRaw = cell(5);
      const vatRate = Number(vatRaw);

      if (!/^\d{1,10}(\.\d{1,2})?$/.test(salePriceRaw)) {
        parseErrors.push({ row: rowNumber, field: 'salePrice', message: 'Geçersiz satış fiyatı.' });
        return;
      }
      if (!Number.isInteger(vatRate) || vatRate < 0 || vatRate > 100) {
        parseErrors.push({ row: rowNumber, field: 'vatRate', message: 'Geçersiz KDV oranı.' });
        return;
      }

      rows.push({
        row: rowNumber,
        name,
        code: cell(2) || undefined,
        unit: cell(3),
        salePrice: salePriceRaw,
        vatRate,
        barcode: cell(6) || undefined,
      });
    });

    return { rows, parseErrors };
  }

  private async insertRow(tx: TenantTransaction, tenantId: string, row: ParsedRow): Promise<void> {
    const unit = await tx.unit.findFirst({
      where: { OR: [{ abbreviation: row.unit }, { name: row.unit }], deletedAt: null },
      select: { id: true },
    });
    if (!unit) throw new Error(`Birim bulunamadı: ${row.unit}`);

    await tx.product.create({
      data: {
        tenantId,
        name: row.name,
        code: row.code ?? null,
        unitId: unit.id,
        salePrice: row.salePrice,
        vatRate: row.vatRate,
        // Nested barkod create'i extension'ın tenantId enjeksiyonuna girmiyor; açıkça veriliyor.
        ...(row.barcode
          ? { barcodes: { create: [{ tenantId, value: row.barcode, isPrimary: true }] } }
          : {}),
      },
    });
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return 'Bu barkod veya kod zaten kullanımda.';
    }
    return error instanceof Error ? error.message : 'Bilinmeyen hata.';
  }
}
