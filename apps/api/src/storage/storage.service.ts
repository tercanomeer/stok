import { randomUUID } from 'node:crypto';

import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { NotFoundError, ValidationError } from '../common/errors/domain-error.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * S3/MinIO nesne deposu. Ürün görselleri ve üretilen PDF'ler burada.
 * Dosya adı rastgele — kullanıcının verdiği ad kullanılmaz (path traversal / çakışma yok).
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBase: string;

  constructor(@Inject(ENV) env: Env) {
    this.bucket = env.S3_BUCKET;
    this.publicBase = `${env.S3_ENDPOINT.replace(/\/$/, '')}/${env.S3_BUCKET}`;
    this.client = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET },
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Bucket oluşturuldu: ${this.bucket}`);
    }
  }

  /** Ürün görseli yükler; MIME ve boyut kontrolü — CLAUDE.md "Dosya yükleme". */
  async uploadProductImage(
    tenantId: string,
    file: { buffer: Buffer; mimetype: string; size: number },
  ): Promise<string> {
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      throw new ValidationError('Yalnız JPEG, PNG veya WebP yüklenebilir.');
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new ValidationError('Görsel 5 MB’den küçük olmalı.');
    }

    const extension =
      file.mimetype === 'image/png' ? 'png' : file.mimetype === 'image/webp' ? 'webp' : 'jpg';
    const key = `products/${tenantId}/${randomUUID()}.${extension}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    return `${this.publicBase}/${key}`;
  }

  async uploadPdf(tenantId: string, name: string, body: Buffer): Promise<string> {
    const key = `labels/${tenantId}/${randomUUID()}-${name}.pdf`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: 'application/pdf',
      }),
    );
    return `${this.publicBase}/${key}`;
  }

  /** Rapor export dosyası (xlsx/pdf) — BullMQ export job'ı bunu çağırır. */
  async uploadExport(
    tenantId: string,
    name: string,
    body: Buffer,
    contentType: string,
  ): Promise<string> {
    const key = `exports/${tenantId}/${randomUUID()}-${name}`;
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
    return `${this.publicBase}/${key}`;
  }

  /**
   * Depodaki nesneyi okur. Kova ÖZELdir; dosyalar doğrudan URL ile açılmaz
   * (403). İndirme, yetki kontrolü yapan bir uç üzerinden akıtılır — ekstre
   * Excel'inde olduğu gibi.
   */
  async download(key: string): Promise<Buffer> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const body = result.Body;
    if (!body) throw new NotFoundError('Dosya bulunamadı.');
    return Buffer.from(await body.transformToByteArray());
  }

  /** Kayıtlı genel adresten nesne anahtarını çıkarır (depo dışı adres kabul edilmez). */
  objectKeyFromUrl(url: string): string {
    const prefix = `${this.publicBase}/`;
    if (!url.startsWith(prefix)) {
      throw new ValidationError('Dosya adresi bu depoya ait değil.');
    }
    return url.slice(prefix.length);
  }

  get imageConstraints(): { types: readonly string[]; maxBytes: number } {
    return { types: [...ALLOWED_IMAGE_TYPES], maxBytes: MAX_IMAGE_BYTES };
  }
}
