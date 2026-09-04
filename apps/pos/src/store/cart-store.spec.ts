import type { CatalogProduct } from '@shared/ipc-contracts';
import { beforeEach, describe, expect, it } from 'vitest';


import { cartBreakdown, lineTotals, useCart } from './cart-store';

function product(overrides: Partial<CatalogProduct> & { id: string }): CatalogProduct {
  return {
    name: 'Ekmek',
    salePrice: '10.00',
    vatRate: 1,
    stockQuantity: '25',
    trackStock: true,
    unitId: 'u1',
    barcodes: [],
    ...overrides,
  };
}

const EKMEK = product({ id: 'p1' });
const SUT = product({ id: 'p2', name: 'Süt', salePrice: '30.00', vatRate: 10 });

beforeEach(() => {
  useCart.getState().clear();
});

describe('sepet — ürün ekleme', () => {
  it('aynı ürün ikinci kez okutulunca YENİ satır açmaz, miktarı artırır', () => {
    const cart = useCart.getState();
    cart.addProduct(EKMEK);
    expect(useCart.getState().lines[0]?.quantity).toBe('1');

    cart.addProduct(EKMEK);
    expect(useCart.getState().lines).toHaveLength(1);
    expect(useCart.getState().lines[0]?.quantity).toBe('2');
  });

  it('tartılı barkodun miktarı AYRI satır açar', () => {
    // Ağırlık barkoddan geldiği için birleştirme yanlış olurdu: 0.750 + 0.400
    // tek satırda toplanırsa kasiyer hangi etiketin okunduğunu göremez.
    const cart = useCart.getState();
    cart.addProduct(EKMEK, '0.75');
    cart.addProduct(EKMEK, '0.4');

    expect(useCart.getState().lines).toHaveLength(2);
  });

  it('indirimli satır ayrı tutulur', () => {
    const cart = useCart.getState();
    cart.addProduct(EKMEK);
    const lineId = useCart.getState().lines[0]!.lineId;
    cart.setLineDiscount(lineId, '10');
    cart.addProduct(EKMEK);

    expect(useCart.getState().lines).toHaveLength(2);
  });

  it('eklenen satır seçili olur', () => {
    useCart.getState().addProduct(EKMEK);
    expect(useCart.getState().selectedLineId).toBe(useCart.getState().lines[0]?.lineId);
  });
});

describe('sepet — miktar', () => {
  it('artırma ve azaltma miktarı değiştirir', () => {
    const cart = useCart.getState();
    cart.addProduct(EKMEK);
    const lineId = useCart.getState().lines[0]!.lineId;

    cart.step(lineId, 1);
    expect(useCart.getState().lines[0]?.quantity).toBe('2');
    cart.step(lineId, -1);
    expect(useCart.getState().lines[0]?.quantity).toBe('1');
  });

  it('miktar sıfıra inince satır DÜŞER', () => {
    const cart = useCart.getState();
    cart.addProduct(EKMEK);
    cart.step(useCart.getState().lines[0]!.lineId, -1);

    expect(useCart.getState().lines).toHaveLength(0);
  });

  it('sıfır ya da geçersiz miktar sepete satır EKLEMEZ', () => {
    // Bozuk tartı etiketi 0 gram okuyabilir; miktarsız satır toplamı sessizce
    // sıfırlar ve satış gönderimde reddedilirdi.
    const cart = useCart.getState();
    cart.addProduct(EKMEK, '0');
    cart.addProduct(EKMEK, '0.000');
    cart.addProduct(EKMEK, 'abc');

    expect(useCart.getState().lines).toHaveLength(0);
  });

  it('ondalık miktar gereksiz sıfır taşımaz', () => {
    useCart.getState().addProduct(EKMEK, '0.750');
    expect(useCart.getState().lines[0]?.quantity).toBe('0.75');
  });
});

describe('sepet — seçim', () => {
  it('ok tuşu seçimi taşır ve sınırda durur', () => {
    const cart = useCart.getState();
    cart.addProduct(EKMEK);
    cart.addProduct(SUT);
    const [first, second] = useCart.getState().lines;

    cart.select(first!.lineId);
    cart.moveSelection(1);
    expect(useCart.getState().selectedLineId).toBe(second!.lineId);
    cart.moveSelection(1);
    expect(useCart.getState().selectedLineId).toBe(second!.lineId);
    cart.moveSelection(-5);
    expect(useCart.getState().selectedLineId).toBe(first!.lineId);
  });

  it('seçili satır silinince seçim boşta kalmaz', () => {
    const cart = useCart.getState();
    cart.addProduct(EKMEK);
    cart.addProduct(SUT);
    const [first] = useCart.getState().lines;

    cart.select(first!.lineId);
    cart.removeLine(first!.lineId);

    expect(useCart.getState().selectedLineId).toBe(useCart.getState().lines[0]?.lineId);
  });
});

describe('sepet — taslak ve toplam', () => {
  it('taslak sözleşme biçiminde çıkar, ekran alanlarını taşımaz', () => {
    const cart = useCart.getState();
    cart.addProduct(EKMEK, '2');
    cart.setCustomer({ id: 'c1', name: 'Ahmet Bey' });
    cart.setDocumentDiscount('5');

    const draft = useCart.getState().toDraft();
    expect(draft.lines[0]).toEqual({
      productId: 'p1',
      name: 'Ekmek',
      quantity: '2',
      unitPrice: '10.00',
      vatRate: 1,
    });
    expect(draft.contactId).toBe('c1');
    expect(draft.documentDiscountRate).toBe('5');
  });

  it('boş sepetin toplamı sıfırdır (pos-core boş listeyi kabul etmez)', () => {
    expect(cartBreakdown([], null).totals.grandTotal).toBe('0.00');
  });

  it('toplam pos-core ile hesaplanır', () => {
    const cart = useCart.getState();
    cart.addProduct(EKMEK, '2'); // 20.00
    cart.addProduct(SUT); // 30.00

    const breakdown = cartBreakdown(useCart.getState().lines, null);
    expect(breakdown.totals.grandTotal).toBe('50.00');
  });

  it('belge indirimi toplamı düşürür', () => {
    useCart.getState().addProduct(EKMEK, '2');
    expect(cartBreakdown(useCart.getState().lines, '10').totals.grandTotal).toBe('18.00');
  });

  it('geçersiz ara durum ekranı kilitlemez', () => {
    useCart.getState().addProduct(EKMEK, '2');
    // %200 indirim pos-core'da hata; ekran boş toplama düşer, çökmez.
    expect(cartBreakdown(useCart.getState().lines, '200').totals.grandTotal).toBe('0.00');
  });

  it('satır tutarları satır kimliğine bağlanır', () => {
    const cart = useCart.getState();
    cart.addProduct(EKMEK, '2');
    cart.addProduct(SUT);
    const lines = useCart.getState().lines;

    const totals = lineTotals(lines, cartBreakdown(lines, null));
    expect(totals.get(lines[0]!.lineId)).toBe('20.00');
    expect(totals.get(lines[1]!.lineId)).toBe('30.00');
  });
});

describe('sepet — park geri yükleme', () => {
  it('taslağı geri yükler ve stok bilgisini önbellekten tazeler', () => {
    useCart.getState().load(
      {
        lines: [{ productId: 'p2', name: 'Süt', quantity: '1', unitPrice: '30.00', vatRate: 10 }],
        payments: [],
        contactId: 'c1',
        contactName: 'Ahmet Bey',
      },
      new Map([[SUT.id, SUT]]),
    );

    const { lines, customer } = useCart.getState();
    expect(lines[0]).toMatchObject({ productId: 'p2', stockQuantity: '25', trackStock: true });
    expect(customer).toEqual({ id: 'c1', name: 'Ahmet Bey' });
  });

  it('önbellekte olmayan ürün stok takipsiz sayılır', () => {
    useCart.getState().load(
      {
        lines: [
          { productId: 'silinmis', name: 'Eski', quantity: '1', unitPrice: '5.00', vatRate: 1 },
        ],
        payments: [],
      },
      new Map(),
    );

    expect(useCart.getState().lines[0]?.trackStock).toBe(false);
  });
});
