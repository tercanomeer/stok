import { Injectable } from '@nestjs/common';
import { toBuffer } from 'bwip-js';
import PDFDocument from 'pdfkit';

import { NotFoundError } from '../../common/errors/domain-error.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';

/**
 * Barkod etiketi PDF'i. Seçili ürünlerin birincil barkodundan bwip-js ile
 * EAN/CODE128 görseli üretilir, pdfkit ile yazdırılabilir sayfa düzenine dizilir.
 */
@Injectable()
export class ProductLabelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async generate(productIds: string[], tenantId: string): Promise<{ url: string; count: number }> {
    const products = await this.prisma.withTenant((tx) =>
      tx.product.findMany({
        where: { id: { in: productIds }, deletedAt: null },
        select: {
          name: true,
          salePrice: true,
          barcodes: { where: { isPrimary: true }, select: { value: true }, take: 1 },
        },
      }),
    );

    if (products.length === 0) throw new NotFoundError('Etiket basılacak ürün bulunamadı.');

    const labels = products.filter((p) => p.barcodes[0]?.value);
    const pdf = await this.render(
      labels.map((p) => ({
        name: p.name,
        price: p.salePrice.toFixed(2),
        barcode: p.barcodes[0]?.value ?? '',
      })),
    );

    const url = await this.storage.uploadPdf(tenantId, 'etiketler', pdf);
    return { url, count: labels.length };
  }

  private async render(
    labels: { name: string; price: string; barcode: string }[],
  ): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 20 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve) =>
      doc.on('end', () => resolve(Buffer.concat(chunks))),
    );

    // 3 sütun x 8 satır etiket ızgarası.
    const cols = 3;
    const cellW = 180;
    const cellH = 90;
    const startX = 20;
    const startY = 20;

    for (let i = 0; i < labels.length; i += 1) {
      const label = labels[i];
      if (!label) continue;
      const col = i % cols;
      const rowInPage = Math.floor(i / cols) % 8;
      if (i > 0 && col === 0 && rowInPage === 0) doc.addPage();

      const x = startX + col * cellW;
      const y = startY + rowInPage * cellH;

      const png = await toBuffer({
        bcid: 'code128',
        text: label.barcode,
        scale: 2,
        height: 10,
        includetext: true,
      });
      doc.image(png, x, y, { width: 140 });
      doc.fontSize(8).text(label.name.slice(0, 30), x, y + 45, { width: 160 });
      doc.fontSize(9).text(`${label.price} TL`, x, y + 58, { width: 160 });
    }

    doc.end();
    return done;
  }
}
