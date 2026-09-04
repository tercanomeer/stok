import type { CatalogProduct, SaleDraft, SaleLineDraft } from '@shared/ipc-contracts';
import { create } from 'zustand';

import { calculateSaleBreakdown, type SaleBreakdown } from '@stokk/pos-core';


/** Sepetteki satır — satış sözleşmesinin alanları + ekranın ihtiyaç duyduğu kimlik. */
export interface CartLine extends SaleLineDraft {
  /** Satır kimliği: aynı ürün farklı fiyat/notla iki kez girilebilir. */
  lineId: string;
  /** Stok uyarısı için önbellekteki miktar; hesaba girmez. */
  stockQuantity: string;
  trackStock: boolean;
}

export interface CartCustomer {
  id: string;
  name: string;
}

interface CartState {
  lines: CartLine[];
  /** Klavye ile seçili satır — `+`/`−` ve silme bunun üzerinde çalışır. */
  selectedLineId: string | null;
  customer: CartCustomer | null;
  documentDiscountRate: string | null;
  note: string | null;

  // Hepsi OK FONKSİYON alanı: bileşenlere `onStep={cart.step}` diye doğrudan
  // geçiriliyorlar, metod olarak tanımlanırsa `this` bağlaması uyarısı doğuyor.
  addProduct: (product: CatalogProduct, quantity?: string) => void;
  setQuantity: (lineId: string, quantity: string) => void;
  /** Miktarı bir birim artırır/azaltır; 0'a inerse satır düşer. */
  step: (lineId: string, delta: number) => void;
  removeLine: (lineId: string) => void;
  setLineDiscount: (lineId: string, rate: string | null) => void;
  setLineNote: (lineId: string, note: string | null) => void;
  setDocumentDiscount: (rate: string | null) => void;
  setCustomer: (customer: CartCustomer | null) => void;
  select: (lineId: string | null) => void;
  /** Satır seçimini bir yukarı/aşağı taşır (ok tuşları). */
  moveSelection: (delta: number) => void;
  load: (draft: SaleDraft, products: Map<string, CatalogProduct>) => void;
  clear: () => void;
  toDraft: () => SaleDraft;
}

let counter = 0;
function nextLineId(): string {
  counter += 1;
  return `line-${counter}`;
}

/** Miktar 3 ondalıkla tutulur (tartılı ürün); tamsayı ise ondalık gösterilmez. */
function normalizeQuantity(value: number): string {
  if (value <= 0) return '0';
  const fixed = value.toFixed(3);
  return fixed.replace(/\.?0+$/, '');
}

export const useCart = create<CartState>((set, get) => ({
  lines: [],
  selectedLineId: null,
  customer: null,
  documentDiscountRate: null,
  note: null,

  /**
   * Aynı ürün ikinci kez okutulursa YENİ satır açılmaz, mevcut satırın miktarı artar —
   * kasiyer 12 tane su okuttuğunda sepette 12 satır değil "12 adet su" görmeli.
   * İndirimli ya da notlu satır ayrı tutulur: onlar bilinçli olarak farklıdır.
   */
  addProduct(product, quantity) {
    const added = Number(quantity ?? '1');
    // Tartı etiketi 0 gram okuyabilir (bozuk etiket, sıfırlanmamış terazi).
    // Miktarsız satır sepette görünür ama toplamı sessizce sıfırlardı.
    if (!Number.isFinite(added) || added <= 0) return;
    const existing = get().lines.find(
      (line) =>
        line.productId === product.id && line.discountRate === undefined && line.note === undefined,
    );
    if (existing && quantity === undefined) {
      get().setQuantity(existing.lineId, normalizeQuantity(Number(existing.quantity) + added));
      set({ selectedLineId: existing.lineId });
      return;
    }

    const lineId = nextLineId();
    set((state) => ({
      lines: [
        ...state.lines,
        {
          lineId,
          productId: product.id,
          name: product.name,
          quantity: normalizeQuantity(added),
          unitPrice: product.salePrice,
          vatRate: product.vatRate,
          stockQuantity: product.stockQuantity,
          trackStock: product.trackStock,
        },
      ],
      selectedLineId: lineId,
    }));
  },

  setQuantity(lineId, quantity) {
    const value = Number(quantity);
    if (!Number.isFinite(value) || value <= 0) {
      get().removeLine(lineId);
      return;
    }
    set((state) => ({
      lines: state.lines.map((line) =>
        line.lineId === lineId ? { ...line, quantity: normalizeQuantity(value) } : line,
      ),
    }));
  },

  step(lineId, delta) {
    const line = get().lines.find((item) => item.lineId === lineId);
    if (!line) return;
    get().setQuantity(lineId, normalizeQuantity(Number(line.quantity) + delta));
  },

  removeLine(lineId) {
    set((state) => {
      const index = state.lines.findIndex((line) => line.lineId === lineId);
      const lines = state.lines.filter((line) => line.lineId !== lineId);
      // Silinen satır seçiliyse seçim boşta kalmasın: yerine geçen satıra kayar.
      const nextSelected =
        state.selectedLineId === lineId
          ? (lines[Math.min(index, lines.length - 1)]?.lineId ?? null)
          : state.selectedLineId;
      return { lines, selectedLineId: nextSelected };
    });
  },

  setLineDiscount(lineId, rate) {
    set((state) => ({
      lines: state.lines.map((line) =>
        line.lineId === lineId ? { ...line, discountRate: rate ?? undefined } : line,
      ),
    }));
  },

  setLineNote(lineId, note) {
    set((state) => ({
      lines: state.lines.map((line) =>
        line.lineId === lineId ? { ...line, note: note ?? undefined } : line,
      ),
    }));
  },

  setDocumentDiscount(rate) {
    set({ documentDiscountRate: rate });
  },

  setCustomer(customer) {
    set({ customer });
  },

  select(lineId) {
    set({ selectedLineId: lineId });
  },

  moveSelection(delta) {
    const { lines, selectedLineId } = get();
    if (lines.length === 0) return;
    const current = lines.findIndex((line) => line.lineId === selectedLineId);
    const next = current < 0 ? 0 : Math.min(lines.length - 1, Math.max(0, current + delta));
    set({ selectedLineId: lines[next]?.lineId ?? null });
  },

  /**
   * Park edilmiş sepeti geri yükler. Stok bilgisi taslakta yoktur (satış sözleşmesine
   * ait değil) — güncel önbellekten tazelenir, bulunamayan ürün uyarısız satılmasın diye
   * takipsiz kabul edilir.
   */
  load(draft, products) {
    set({
      lines: draft.lines.map((line) => {
        const product = products.get(line.productId);
        return {
          ...line,
          lineId: nextLineId(),
          stockQuantity: product?.stockQuantity ?? '0',
          trackStock: product?.trackStock ?? false,
        };
      }),
      selectedLineId: null,
      customer:
        draft.contactId && draft.contactName
          ? { id: draft.contactId, name: draft.contactName }
          : null,
      documentDiscountRate: draft.documentDiscountRate ?? null,
      note: draft.note ?? null,
    });
  },

  clear() {
    set({
      lines: [],
      selectedLineId: null,
      customer: null,
      documentDiscountRate: null,
      note: null,
    });
  },

  /** Ödeme adımına geçerken sepeti sözleşme biçimine çevirir (ödemeler sonra eklenir). */
  toDraft() {
    const state = get();
    return {
      lines: state.lines.map((line) => ({
        productId: line.productId,
        name: line.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        vatRate: line.vatRate,
        ...(line.discountRate === undefined ? {} : { discountRate: line.discountRate }),
        ...(line.note === undefined ? {} : { note: line.note }),
      })),
      payments: [],
      ...(state.customer === null
        ? {}
        : { contactId: state.customer.id, contactName: state.customer.name }),
      ...(state.documentDiscountRate === null
        ? {}
        : { documentDiscountRate: state.documentDiscountRate }),
      ...(state.note === null ? {} : { note: state.note }),
    };
  },
}));

/** Boş sepetin dökümü — `calculateSaleBreakdown` boş listeyi kabul etmez. */
export const EMPTY_BREAKDOWN: SaleBreakdown = {
  lines: [],
  totals: {
    subtotal: '0.00',
    discountTotal: '0.00',
    vatBreakdown: [],
    vatTotal: '0.00',
    grandTotal: '0.00',
  },
};

/**
 * Sepetin dökümü — hesap `@stokk/pos-core` üzerinden. Ekranda gösterilen satır
 * tutarı da toplam da BURADAN gelir; renderer'da ikinci bir formül yazılmaz (CLAUDE.md).
 *
 * Geçersiz bir ara durum (miktar 0, oran 100'ün üstünde) toplamı patlatıp ekranı
 * kilitlemesin diye hata boş döküme düşer; satış gönderimi zaten main tarafında
 * aynı fonksiyonla yeniden doğrulanıyor.
 */
export function cartBreakdown(
  lines: readonly CartLine[],
  documentDiscountRate: string | null,
): SaleBreakdown {
  if (lines.length === 0) return EMPTY_BREAKDOWN;
  try {
    return calculateSaleBreakdown({
      lines: lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        vatRate: line.vatRate,
        ...(line.discountRate === undefined ? {} : { discountRate: line.discountRate }),
      })),
      ...(documentDiscountRate === null ? {} : { documentDiscountRate }),
    });
  } catch {
    return EMPTY_BREAKDOWN;
  }
}

/** Satır kimliği → müşteriden alınacak tutar. Sepet listesi bunu okur. */
export function lineTotals(
  lines: readonly CartLine[],
  breakdown: SaleBreakdown,
): Map<string, string> {
  return new Map(
    lines.map((line, index) => [line.lineId, breakdown.lines[index]?.lineTotal ?? '0.00']),
  );
}
