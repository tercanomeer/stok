import {
  calculateSaleBreakdown,
  maxEffectiveDiscountRate,
  PosCoreError,
  settlePayments,
  type SaleBreakdown,
} from '@stokk/pos-core';
import { PERMISSIONS } from '@stokk/types';

import type { ApiClient } from './api-client';
import type { AuthService } from './auth-service';
import type { ConfigStore } from './config-store';
import type { ShiftService } from './shift-service';
import type { SyncService } from './sync-service';
import { readSettings } from '../db/cache-repo';
import { findProductById } from '../db/catalog-repo';
import type { PosDatabase } from '../db/database';
import { findLocalSale, readLocalSale, saveLocalSale } from '../db/local-sale-repo';
import { discardParked, listParked, parkSale, unparkSale } from '../db/parked-repo';
import { AppError } from '../lib/app-error';
import type {
  CompletedSale,
  ParkedSale,
  ReceiptData,
  RecentSale,
  ReturnInput,
  ReturnResult,
  SaleDraft,
} from '../shared/ipc-contracts';

export interface SaleDeps {
  db: PosDatabase;
  api: ApiClient;
  auth: AuthService;
  shift: ShiftService;
  sync: SyncService;
  config: ConfigStore;
  isOnline: () => boolean;
  clock?: () => Date;
}

/**
 * Satışın kasadaki tek çıkış kapısı.
 *
 * Satış ÖNCE yerele yazılır, sonra gönderilir — çevrimiçi olsa bile. Doğrudan API'ye
 * gönderip yanıtı beklemek, isteğin uçtuğu ama yanıtın dönmediği anda (kablo, timeout)
 * kasiyeri "gitti mi gitmedi mi" bilmediği bir yerde bırakırdı. Yerel kayıt + kuyruk
 * tek yol olduğu için gönderim de tek yerden geçiyor ve `clientSaleId` sayesinde
 * ikinci deneme yeni satış açmıyor.
 */
export class SaleService {
  constructor(private readonly deps: SaleDeps) {}

  private now(): Date {
    return (this.deps.clock ?? (() => new Date()))();
  }

  /**
   * Satışı tamamlar: doğrula → hesapla → yerele yaz → (ağ varsa) hemen gönder.
   * Fiş verisi her iki yolda da üretilir; çevrimdışında fiş no boş kalır.
   */
  async submit(draft: SaleDraft): Promise<CompletedSale> {
    const session = this.deps.auth.session;
    if (!session) throw new AppError('NO_SESSION', 'Oturum kapalı, satış kaydedilemez.');

    const shift = this.deps.shift.active;
    if (!shift) {
      throw new AppError('NO_SHIFT', 'Açık vardiya bulunamadı; önce vardiya açın.');
    }

    const breakdown = this.calculate(draft);
    this.assertDiscountAllowed(breakdown, session.user.permissions);
    this.assertStockAllowed(draft);
    const changeDue = this.settle(draft, breakdown.totals.grandTotal);

    const now = this.now();
    const soldAt = now.toISOString();
    const record = saveLocalSale(
      this.deps.db,
      {
        cashSessionId: shift.id,
        soldAt,
        ...(draft.contactId === undefined ? {} : { contactId: draft.contactId }),
        ...(draft.documentDiscountRate === undefined
          ? {}
          : { documentDiscountRate: draft.documentDiscountRate }),
        ...(draft.note === undefined ? {} : { note: draft.note }),
        lines: draft.lines.map((line) => ({
          productId: line.productId,
          name: line.name,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          vatRate: line.vatRate,
          ...(line.discountRate === undefined ? {} : { discountRate: line.discountRate }),
          ...(line.note === undefined ? {} : { note: line.note }),
        })),
        payments: draft.payments.map((payment) => ({
          method: payment.method,
          amount: payment.amount,
          ...(payment.receivedAmount === undefined
            ? {}
            : { receivedAmount: payment.receivedAmount }),
          ...(payment.reference === undefined ? {} : { reference: payment.reference }),
        })),
      },
      now,
    );

    // Ağ varsa kuyruğun 30 sn'lik turunu BEKLEME: fiş numarası kasiyer daha
    // ekrandayken gelsin. Gönderim başarısızsa satış kuyrukta kalır, hata
    // satışı geri almaz — para zaten alındı.
    if (this.deps.isOnline()) {
      await this.deps.sync.runOnce().catch(() => undefined);
    }

    const stored = findLocalSale(this.deps.db, record.id);
    return {
      clientSaleId: record.id,
      grandTotal: breakdown.totals.grandTotal,
      changeDue,
      synced: stored?.status === 'SYNCED',
      receipt: this.buildReceipt({
        clientSaleId: record.id,
        receiptNo: stored?.receiptNo ?? null,
        soldAt,
        cashierName: session.user.fullName,
        draft,
        breakdown,
        changeDue,
      }),
    };
  }

  /**
   * Kaydedilmiş bir satışın fişi — yeniden basım ve ÖKC bildirimi için.
   *
   * Fiş, satışın YAPILDIĞI andaki girdilerle kurulur: miktar, birim fiyat, KDV
   * oranı ve indirim kayıttan okunur, katalogdan DEĞİL. Hesap yine
   * `@stokk/pos-core` ile yapılır — aynı girdi aynı sonucu verir ve fişte ikinci
   * bir KDV formülü doğmaz (CLAUDE.md).
   */
  receiptFor(clientSaleId: string): { receipt: ReceiptData; cashSale: boolean } {
    const stored = readLocalSale(this.deps.db, clientSaleId);
    if (!stored) throw new AppError('SALE_NOT_FOUND', 'Satış bulunamadı.');

    const breakdown = this.calculate({
      lines: stored.lines.map((line) => ({
        productId: line.productId,
        name: line.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        vatRate: line.vatRate,
        ...(line.discountRate === null ? {} : { discountRate: line.discountRate }),
      })),
      payments: [],
      ...(stored.documentDiscountRate === null
        ? {}
        : { documentDiscountRate: stored.documentDiscountRate }),
    });

    const payments = stored.payments.map((payment) => ({
      method: payment.method,
      amount: payment.amount,
      ...(payment.receivedAmount === null ? {} : { receivedAmount: payment.receivedAmount }),
    }));
    const settlement = settlePayments(payments, breakdown.totals.grandTotal);

    const settings = readSettings(this.deps.db);
    const config = this.deps.config.get();

    return {
      cashSale: Number(settlement.cashDue) > 0,
      receipt: {
        receiptNo: stored.receiptNo,
        clientSaleId: stored.id,
        soldAt: stored.soldAt,
        registerName: config.registerName,
        cashierName: this.deps.auth.session?.user.fullName ?? '-',
        // Müşteri adı yerel satışta saklanmıyor (yalnız `contactId`); kopyada
        // yanlış ad basmaktansa boş bırakılıyor.
        contactName: null,
        lines: stored.lines.map((line, index) => ({
          name: line.name,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          lineTotal: breakdown.lines[index]?.lineTotal ?? line.lineTotal,
          vatRate: line.vatRate,
        })),
        subtotal: breakdown.totals.subtotal,
        discountTotal: breakdown.totals.discountTotal,
        vatBreakdown: breakdown.totals.vatBreakdown,
        vatTotal: breakdown.totals.vatTotal,
        grandTotal: breakdown.totals.grandTotal,
        payments: stored.payments.map((payment) => ({
          method: payment.method,
          amount: payment.amount,
          receivedAmount: payment.receivedAmount,
        })),
        changeDue: settlement.changeDue,
        header: settings?.receiptHeader ?? null,
        footer: settings?.receiptFooter ?? null,
        currency: settings?.currency ?? 'TRY',
      },
    };
  }

  // --- park -----------------------------------------------------------------

  park(input: { label: string; draft: SaleDraft }): ParkedSale {
    if (input.draft.lines.length === 0) {
      throw new AppError('EMPTY_SALE', 'Boş sepet park edilemez.');
    }
    const breakdown = this.calculate(input.draft);
    return parkSale(this.deps.db, {
      label: input.label,
      draft: input.draft,
      grandTotal: breakdown.totals.grandTotal,
      now: this.now(),
    });
  }

  parked(): ParkedSale[] {
    return listParked(this.deps.db);
  }

  unpark(id: string): SaleDraft {
    const draft = unparkSale(this.deps.db, id);
    if (!draft) throw new AppError('PARKED_NOT_FOUND', 'Park edilmiş satış bulunamadı.');
    return draft;
  }

  discard(id: string): null {
    if (!discardParked(this.deps.db, id)) {
      throw new AppError('PARKED_NOT_FOUND', 'Park edilmiş satış bulunamadı.');
    }
    return null;
  }

  // --- iade -----------------------------------------------------------------

  /**
   * İade edilebilecek satışlar. Sunucudan gelir: iade stok ve cari hareketi üretir,
   * kasa bunu tek başına yapamaz. Çevrimdışıyken iade ekranı açılmaz.
   */
  async recent(search: string): Promise<RecentSale[]> {
    this.assertOnline('İade için internet bağlantısı gerekli.');
    const list = await this.deps.api.request<{ items: { id: string }[] }>('/sales', {
      query: {
        limit: '10',
        sort: 'soldAt:desc',
        status: 'COMPLETED',
        ...(search.trim() === '' ? {} : { search: search.trim() }),
      },
    });
    // Liste ucu kalemleri taşımıyor; iade ekranı kalem seçtireceği için tek tek çekiliyor.
    return Promise.all(
      list.items.map((item) => this.deps.api.request<RecentSale>(`/sales/${item.id}`)),
    );
  }

  async submitReturn(input: ReturnInput): Promise<ReturnResult> {
    this.assertOnline('İade için internet bağlantısı gerekli.');
    return this.deps.api.request<ReturnResult>(`/sales/${input.saleId}/returns`, {
      method: 'POST',
      body: {
        refundMethod: input.refundMethod,
        reason: input.reason,
        items: input.items,
      },
    });
  }

  // --- iç yardımcılar -------------------------------------------------------

  private assertOnline(message: string): void {
    if (!this.deps.isOnline()) throw new AppError('OFFLINE', message);
  }

  /** Hesap TEK yerde: `@stokk/pos-core`. POS'ta ikinci bir formül yazılmaz (CLAUDE.md). */
  private calculate(draft: SaleDraft): SaleBreakdown {
    try {
      return calculateSaleBreakdown({
        lines: draft.lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          vatRate: line.vatRate,
          ...(line.discountRate === undefined ? {} : { discountRate: line.discountRate }),
        })),
        ...(draft.documentDiscountRate === undefined
          ? {}
          : { documentDiscountRate: draft.documentDiscountRate }),
      });
    } catch (error) {
      if (error instanceof PosCoreError) throw new AppError(error.code, error.message);
      throw error;
    }
  }

  /**
   * Yüksek indirim kapısı — sunucudakinin aynısı, önbellekteki eşikle.
   *
   * Sunucu bunu yine doğrular; buradaki kontrol kasiyere ANINDA cevap vermek içindir.
   * Çevrimdışı satışta ise tek kontrol budur: yetkisiz indirim kuyruğa girip saatler
   * sonra "gönderilemedi" olarak dönerse müşteri çoktan gitmiş olur.
   */
  private assertDiscountAllowed(breakdown: SaleBreakdown, permissions: readonly string[]): void {
    if (permissions.includes(PERMISSIONS.SALE_DISCOUNT_HIGH)) return;

    const threshold = readSettings(this.deps.db)?.highDiscountThreshold ?? '10.00';
    // Oran pos-core'da hesaplanır — sunucu da aynı fonksiyonu çağırıyor.
    if (Number(maxEffectiveDiscountRate(breakdown)) > Number(threshold)) {
      throw new AppError(
        'DISCOUNT_NOT_ALLOWED',
        `%${threshold} üzeri indirim yetkiniz yok; yöneticinizden onay alın.`,
      );
    }
  }

  /**
   * Negatif stok politikası — sunucudakinin önbellekteki kopyası.
   *
   * `BLOCK` politikasında sunucu satışı zaten reddeder; ama çevrimdışı satışta bu
   * red saatler sonra gelir ve satış "gönderilemedi" kuyruğuna düşer — mal çoktan
   * verilmiş olur. Bu yüzden kapı kasada da uygulanıyor. Önbellekteki stok bir
   * tur eski olabilir, o yüzden kesin doğruluk değil ERKEN UYARI amaçlı: sunucu
   * son sözü yine söylüyor.
   */
  private assertStockAllowed(draft: SaleDraft): void {
    if (readSettings(this.deps.db)?.negativeStockPolicy !== 'BLOCK') return;

    // Aynı ürün birden çok satırda olabilir (indirimli/notlu satır ayrı tutuluyor).
    const requested = new Map<string, number>();
    for (const line of draft.lines) {
      requested.set(line.productId, (requested.get(line.productId) ?? 0) + Number(line.quantity));
    }

    for (const [productId, quantity] of requested) {
      const product = findProductById(this.deps.db, productId);
      if (!product?.trackStock) continue;
      if (Number(product.stockQuantity) < quantity) {
        throw new AppError(
          'NEGATIVE_STOCK_BLOCKED',
          `${product.name} için yeterli stok yok (kalan ${product.stockQuantity}); işletme ayarı negatif stoğa izin vermiyor.`,
        );
      }
    }
  }

  /**
   * Ödemelerin fişi kapattığını doğrular ve para üstünü döner.
   *
   * Toplam ve para üstü hesabı `@stokk/pos-core:settlePayments` içinde; burada yalnız
   * kasaya özgü kural var: veresiye seçildiyse müşteri zorunludur.
   */
  private settle(draft: SaleDraft, grandTotal: string): string {
    let settlement;
    try {
      settlement = settlePayments(draft.payments, grandTotal);
    } catch (error) {
      if (error instanceof PosCoreError) throw new AppError(error.code, error.message);
      throw error;
    }
    if (Number(settlement.creditTotal) > 0 && !draft.contactId) {
      throw new AppError('CREDIT_NO_CONTACT', 'Veresiye satış için müşteri seçin.');
    }
    return settlement.changeDue;
  }

  /** Fiş verisi — ekranda önizlenir, Faz 14'te aynı yapı yazıcıya gider. */
  private buildReceipt(input: {
    clientSaleId: string;
    receiptNo: string | null;
    soldAt: string;
    cashierName: string;
    draft: SaleDraft;
    breakdown: SaleBreakdown;
    changeDue: string;
  }): ReceiptData {
    const settings = readSettings(this.deps.db);
    const config = this.deps.config.get();
    return {
      receiptNo: input.receiptNo,
      clientSaleId: input.clientSaleId,
      soldAt: input.soldAt,
      registerName: config.registerName,
      cashierName: input.cashierName,
      contactName: input.draft.contactName ?? null,
      lines: input.draft.lines.map((line, index) => ({
        name: line.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineTotal: input.breakdown.lines[index]?.lineTotal ?? '0.00',
        vatRate: line.vatRate,
      })),
      subtotal: input.breakdown.totals.subtotal,
      discountTotal: input.breakdown.totals.discountTotal,
      vatBreakdown: input.breakdown.totals.vatBreakdown,
      vatTotal: input.breakdown.totals.vatTotal,
      grandTotal: input.breakdown.totals.grandTotal,
      payments: input.draft.payments.map((payment) => ({
        method: payment.method,
        amount: payment.amount,
        receivedAmount: payment.receivedAmount ?? null,
      })),
      changeDue: input.changeDue,
      header: settings?.receiptHeader ?? null,
      footer: settings?.receiptFooter ?? null,
      currency: settings?.currency ?? 'TRY',
    };
  }
}
