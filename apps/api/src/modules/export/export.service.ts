import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import exceljs from 'exceljs';
import PDFDocument from 'pdfkit';

import { AuditAction } from '@stokk/db';

import type { CreateExportInput } from './dto/export.dto.js';
import { NotFoundError, ValidationError } from '../../common/errors/domain-error.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { runWithTenantContext } from '../../prisma/tenant-context.js';
import { StorageService } from '../../storage/storage.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import { ReportService } from '../reports/report.service.js';

// eslint-disable-next-line import-x/no-named-as-default-member
const { Workbook } = exceljs;

export const EXPORT_QUEUE = 'report-export';

export interface ExportJobData {
  jobId: string;
  tenantId: string;
  userId: string;
  permissions: string[];
  report: string;
  format: string;
  params: Record<string, unknown>;
}

interface BuiltTable {
  title: string;
  columns: { header: string; key: string }[];
  rows: Record<string, unknown>[];
}

@Injectable()
export class ExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly reports: ReportService,
    private readonly storage: StorageService,
    @InjectQueue(EXPORT_QUEUE) private readonly queue: Queue<ExportJobData>,
  ) {}

  async enqueue(input: CreateExportInput, user: AuthenticatedUser): Promise<{ jobId: string }> {
    const job = await this.prisma.withTenant((tx, tenantId) =>
      tx.exportJob.create({
        data: {
          tenantId,
          report: input.report,
          format: input.format,
          status: 'PENDING',
          params: input as unknown as object,
          createdById: user.id,
        },
        select: { id: true },
      }),
    );
    await this.queue.add('export', {
      jobId: job.id,
      tenantId: user.tenantId,
      userId: user.id,
      permissions: user.permissions,
      report: input.report,
      format: input.format,
      params: input,
    });
    await this.audit.record({ action: AuditAction.CREATE, entity: 'ExportJob', entityId: job.id });
    return { jobId: job.id };
  }

  async getStatus(jobId: string) {
    const job = await this.prisma.withTenant((tx) =>
      tx.exportJob.findFirst({
        where: { id: jobId },
        select: {
          id: true,
          report: true,
          format: true,
          status: true,
          fileUrl: true,
          errorMessage: true,
          createdAt: true,
          completedAt: true,
        },
      }),
    );
    if (!job) throw new NotFoundError('Export işi bulunamadı.');
    return job;
  }

  /** Worker'dan çağrılır — tenant bağlamı burada kurulur (runWithTenantContext). */
  async process(data: ExportJobData): Promise<void> {
    await this.prisma.withTenant(
      (tx) =>
        tx.exportJob.update({
          where: { id: data.jobId },
          data: { status: 'PROCESSING', startedAt: new Date() },
        }),
      data.tenantId,
    );

    try {
      const user: AuthenticatedUser = {
        id: data.userId,
        tenantId: data.tenantId,
        email: '',
        fullName: '',
        permissions: data.permissions,
        roles: [],
      };
      const table = await runWithTenantContext(
        { tenantId: data.tenantId, userId: data.userId, permissions: data.permissions },
        () => this.buildTable(data, user),
      );

      const { buffer, contentType, ext } =
        data.format === 'PDF' ? await this.toPdf(table) : await this.toXlsx(table);
      const fileUrl = await this.storage.uploadExport(
        data.tenantId,
        `${data.report}.${ext}`,
        buffer,
        contentType,
      );

      await this.prisma.withTenant(
        (tx) =>
          tx.exportJob.update({
            where: { id: data.jobId },
            data: { status: 'COMPLETED', fileUrl, completedAt: new Date() },
          }),
        data.tenantId,
      );
    } catch (error) {
      await this.prisma.withTenant(
        (tx) =>
          tx.exportJob.update({
            where: { id: data.jobId },
            data: {
              status: 'FAILED',
              errorMessage: error instanceof Error ? error.message : 'Bilinmeyen hata',
              completedAt: new Date(),
            },
          }),
        data.tenantId,
      );
    }
  }

  private async buildTable(data: ExportJobData, user: AuthenticatedUser): Promise<BuiltTable> {
    const p = data.params as {
      from: string;
      to: string;
      granularity?: 'hour' | 'day' | 'week' | 'month';
      limit?: number;
    };
    const gran = p.granularity ?? 'day';
    switch (data.report) {
      case 'sales': {
        const r = await this.reports.sales({ from: p.from, to: p.to, granularity: gran });
        return {
          title: 'Satış Raporu',
          columns: [
            { header: 'Tarih', key: 'date' },
            { header: 'Ciro', key: 'total' },
            { header: 'Adet', key: 'count' },
          ],
          rows: r.series,
        };
      }
      case 'profit': {
        const r = await this.reports.profit({ from: p.from, to: p.to, granularity: gran }, user);
        return {
          title: 'Kâr Raporu',
          columns: [
            { header: 'Tarih', key: 'date' },
            { header: 'Ciro', key: 'revenue' },
            { header: 'Maliyet', key: 'cost' },
            { header: 'Kâr', key: 'profit' },
            { header: 'Marj %', key: 'marginPct' },
          ],
          rows: r.series,
        };
      }
      case 'top-products': {
        const r = await this.reports.topProducts(
          { from: p.from, to: p.to, limit: p.limit ?? 10 },
          user,
        );
        return {
          title: 'En Çok Satanlar',
          columns: [
            { header: 'Ürün', key: 'name' },
            { header: 'Miktar', key: 'quantity' },
            { header: 'Ciro', key: 'revenue' },
          ],
          rows: r.items,
        };
      }
      case 'payment-distribution': {
        const r = await this.reports.paymentDistribution({ from: p.from, to: p.to });
        return {
          title: 'Ödeme Yöntemi Dağılımı',
          columns: [
            { header: 'Yöntem', key: 'method' },
            { header: 'Tutar', key: 'total' },
            { header: 'Adet', key: 'count' },
            { header: 'Yüzde', key: 'pct' },
          ],
          rows: r.methods,
        };
      }
      case 'cashier-performance': {
        const r = await this.reports.cashierPerformance({ from: p.from, to: p.to });
        return {
          title: 'Kasiyer Performansı',
          columns: [
            { header: 'Kasiyer', key: 'name' },
            { header: 'Satış Adedi', key: 'salesCount' },
            { header: 'Ciro', key: 'salesTotal' },
            { header: 'Ort. Sepet', key: 'avgBasket' },
          ],
          rows: r.cashiers,
        };
      }
      default:
        throw new ValidationError('Desteklenmeyen rapor.');
    }
  }

  private async toXlsx(
    table: BuiltTable,
  ): Promise<{ buffer: Buffer; contentType: string; ext: string }> {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet(table.title.slice(0, 31));
    sheet.columns = table.columns.map((c) => ({ header: c.header, key: c.key, width: 20 }));
    for (const row of table.rows) sheet.addRow(row);
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ext: 'xlsx',
    };
  }

  private async toPdf(
    table: BuiltTable,
  ): Promise<{ buffer: Buffer; contentType: string; ext: string }> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 36, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () =>
        resolve({ buffer: Buffer.concat(chunks), contentType: 'application/pdf', ext: 'pdf' }),
      );
      doc.on('error', reject);

      doc.fontSize(16).text(table.title, { underline: true }).moveDown(0.5);
      doc.fontSize(9);
      const header = table.columns.map((c) => c.header).join('  |  ');
      doc.text(header).moveDown(0.2);
      for (const row of table.rows) {
        const line = table.columns.map((c) => formatCell(row[c.key])).join('  |  ');
        doc.text(line);
      }
      doc.end();
    });
  }
}

/** Rapor hücresini güvenle metne çevirir (yalnız string/number; nesne beklenmez). */
function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}
