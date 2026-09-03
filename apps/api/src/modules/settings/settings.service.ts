import { Injectable } from '@nestjs/common';

import { AuditAction } from '@stokk/db';

import type { UpdateSettingsInput } from './dto/settings.dto.js';
import { maskSecret, SecretCipher } from './secret-cipher.js';
import { BusinessRuleError, NotFoundError } from '../../common/errors/domain-error.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';

const TENANT_SELECT = {
  id: true,
  name: true,
  legalName: true,
  taxNumber: true,
  taxOffice: true,
  phone: true,
  email: true,
  address: true,
  plan: true,
  status: true,
  trialEndsAt: true,
} as const;

const SETTINGS_SELECT = {
  vatRates: true,
  defaultVatRate: true,
  currency: true,
  timezone: true,
  negativeStockPolicy: true,
  highDiscountThreshold: true,
  cashDifferenceThreshold: true,
  eArchiveThreshold: true,
  scaleBarcodePrefixes: true,
  receiptHeader: true,
  receiptFooter: true,
  logoUrl: true,
  receiptPrinterName: true,
  receiptWidthMm: true,
  autoPrintReceipt: true,
  eInvoiceUsername: true,
  eInvoiceSecretEnc: true,
  smsSenderTitle: true,
  smsApiKeyEnc: true,
} as const;

/**
 * Tenant ayarları — firma bilgileri, işletme kuralları, fiş/yazıcı ve entegrasyon
 * kimlik bilgileri tek ekranda.
 *
 * Kimlik bilgileri ŞİFRELİ saklanır ve API'den yalnız MASKELİ döner. Güncellemede
 * alan gönderilmezse kayıtlı değer korunur — ekran maskeyi geri gönderip gerçek
 * parolayı "••••1234" ile ezmek zorunda kalmaz (Faz 11 doğrulaması).
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cipher: SecretCipher,
  ) {}

  async get() {
    return this.prisma.withTenant(async (tx, tenantId) => {
      const tenant = await tx.tenant.findFirst({ where: { id: tenantId }, select: TENANT_SELECT });
      if (!tenant) throw new NotFoundError('İşletme bulunamadı.');

      const settings = await tx.tenantSettings.findFirst({ select: SETTINGS_SELECT });
      if (!settings) throw new NotFoundError('İşletme ayarları bulunamadı.');

      const { eInvoiceSecretEnc, smsApiKeyEnc, ...rest } = settings;
      return {
        tenant,
        settings: {
          ...rest,
          // Düz metin ASLA dönmez; yalnız "tanımlı mı" ve son 4 karakter.
          eInvoiceSecretMask: maskSecret(
            eInvoiceSecretEnc ? this.cipher.decrypt(eInvoiceSecretEnc) : null,
          ),
          smsApiKeyMask: maskSecret(smsApiKeyEnc ? this.cipher.decrypt(smsApiKeyEnc) : null),
        },
      };
    });
  }

  async update(input: UpdateSettingsInput) {
    const result = await this.prisma.withTenant(async (tx, tenantId) => {
      const current = await tx.tenantSettings.findFirst({
        select: { vatRates: true, defaultVatRate: true },
      });
      if (!current) throw new NotFoundError('İşletme ayarları bulunamadı.');

      // Varsayılan oran her zaman listede olmalı; biri güncellenip diğeri
      // güncellenmediğinde de tutarlılık korunur (DTO tek istekte kontrol eder).
      const nextRates = input.vatRates ?? current.vatRates;
      const nextDefault = input.defaultVatRate ?? current.defaultVatRate;
      if (!nextRates.includes(nextDefault)) {
        throw new BusinessRuleError(
          'INVALID_DEFAULT_VAT_RATE',
          'Varsayılan KDV oranı, tanımlı oranlar listesinde olmalı.',
        );
      }

      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.legalName === undefined ? {} : { legalName: input.legalName || null }),
          ...(input.taxNumber === undefined ? {} : { taxNumber: input.taxNumber || null }),
          ...(input.taxOffice === undefined ? {} : { taxOffice: input.taxOffice || null }),
          ...(input.phone === undefined ? {} : { phone: input.phone || null }),
          ...(input.email === undefined ? {} : { email: input.email || null }),
          ...(input.address === undefined ? {} : { address: input.address || null }),
        },
      });

      await tx.tenantSettings.updateMany({
        data: {
          ...(input.vatRates === undefined ? {} : { vatRates: input.vatRates }),
          ...(input.defaultVatRate === undefined ? {} : { defaultVatRate: input.defaultVatRate }),
          ...(input.negativeStockPolicy === undefined
            ? {}
            : { negativeStockPolicy: input.negativeStockPolicy }),
          ...(input.highDiscountThreshold === undefined
            ? {}
            : { highDiscountThreshold: input.highDiscountThreshold }),
          ...(input.cashDifferenceThreshold === undefined
            ? {}
            : { cashDifferenceThreshold: input.cashDifferenceThreshold }),
          ...(input.eArchiveThreshold === undefined
            ? {}
            : { eArchiveThreshold: input.eArchiveThreshold }),
          ...(input.scaleBarcodePrefixes === undefined
            ? {}
            : { scaleBarcodePrefixes: input.scaleBarcodePrefixes }),
          ...(input.receiptHeader === undefined
            ? {}
            : { receiptHeader: input.receiptHeader || null }),
          ...(input.receiptFooter === undefined
            ? {}
            : { receiptFooter: input.receiptFooter || null }),
          ...(input.receiptPrinterName === undefined
            ? {}
            : { receiptPrinterName: input.receiptPrinterName || null }),
          ...(input.receiptWidthMm === undefined ? {} : { receiptWidthMm: input.receiptWidthMm }),
          ...(input.autoPrintReceipt === undefined
            ? {}
            : { autoPrintReceipt: input.autoPrintReceipt }),
          ...(input.eInvoiceUsername === undefined
            ? {}
            : { eInvoiceUsername: input.eInvoiceUsername || null }),
          // Secret gönderilmediyse DOKUNULMAZ; boş string açıkça "sil" demektir.
          ...(input.eInvoiceSecret === undefined
            ? {}
            : {
                eInvoiceSecretEnc: input.eInvoiceSecret
                  ? this.cipher.encrypt(input.eInvoiceSecret)
                  : null,
              }),
          ...(input.smsSenderTitle === undefined
            ? {}
            : { smsSenderTitle: input.smsSenderTitle || null }),
          ...(input.smsApiKey === undefined
            ? {}
            : { smsApiKeyEnc: input.smsApiKey ? this.cipher.encrypt(input.smsApiKey) : null }),
        },
      });

      return true;
    });

    // Denetim kaydına yalnız HANGİ alanların değiştiği yazılır; kimlik bilgisi
    // değerleri (şifre, API anahtarı) audit log'a ASLA girmez — CLAUDE.md.
    const changedFields = Object.keys(input).filter(
      (key) => key !== 'eInvoiceSecret' && key !== 'smsApiKey',
    );
    const secretsChanged = [
      ...(input.eInvoiceSecret === undefined ? [] : ['eInvoiceSecret']),
      ...(input.smsApiKey === undefined ? [] : ['smsApiKey']),
    ];
    await this.audit.record({
      action: AuditAction.UPDATE,
      entity: 'TenantSettings',
      changes: { fields: changedFields, secretsRotated: secretsChanged },
    });

    void result;
    return this.get();
  }
}
