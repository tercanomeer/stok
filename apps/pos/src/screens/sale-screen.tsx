import type {
  CashSession,
  CatalogProduct,
  CompletedSale,
  NetworkStatus,
  ParkedSale,
  PosConfig,
  PosSession,
  SalePaymentDraft,
} from '@shared/ipc-contracts';
import { ScanLine } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';
import { Input, useToast } from '@stokk/ui';


import { CartList } from '../components/sale/cart-list';
import { CloseShiftDialog } from '../components/sale/close-shift-dialog';
import { CustomerDialog } from '../components/sale/customer-dialog';
import { DiscountDialog } from '../components/sale/discount-dialog';
import { NoteDialog } from '../components/sale/note-dialog';
import { ParkedDialog } from '../components/sale/parked-dialog';
import { PaymentDialog } from '../components/sale/payment-dialog';
import { ProductGrid } from '../components/sale/product-grid';
import { ReceiptDialog } from '../components/sale/receipt-dialog';
import { ReturnDialog } from '../components/sale/return-dialog';
import { ShortcutBar } from '../components/sale/shortcut-bar';
import { TotalsPanel } from '../components/sale/totals-panel';
import { bridge, errorMessage, unwrap } from '../lib/bridge';
import { actionForKey, type SaleAction } from '../lib/shortcuts';
import { useBarcodeInput } from '../lib/use-barcode-input';
import { cartBreakdown, lineTotals, useCart } from '../store/cart-store';

interface SaleScreenProps {
  config: PosConfig;
  /** Vardiya kapanınca uygulama vardiya açılış adımına döner. */
  onShiftClosed: () => void;
  /** Cihaz ayarları ekranını açar (üst şeritteki dişli ile aynı iş). */
  onOpenSettings: () => void;
  session: PosSession;
  shift: CashSession;
  network: NetworkStatus;
  /**
   * Önbellekteki ürün sayısı. Doğrudan gösterilmez; katalog çekişi bittiğinde
   * DEĞİŞTİĞİ için ürün gridinin yeniden aranmasını tetikler — ilk açılışta grid
   * katalog gelmeden sorulup boş kalıyordu.
   */
  cachedProductCount: number;
}

type Modal =
  'payment' | 'customer' | 'discount' | 'note' | 'parked' | 'return' | 'close-shift' | null;

/**
 * Kasiyerin gün boyu baktığı ekran.
 *
 * Tasarımın tek kuralı var: **odak her zaman barkod alanına döner.** Her modal
 * kapanışında, her satış sonunda, her ürün eklendiğinde. Kasiyer okuyucuyu
 * çektiğinde ürünün sepete girmemesi, bu ekranın yapabileceği en kötü hatadır.
 */
export function SaleScreen({
  config,
  onShiftClosed,
  onOpenSettings,
  session,
  shift,
  network,
  cachedProductCount,
}: SaleScreenProps): ReactElement {
  // Mağazadan ALAN ALAN abone olunuyor: `useCart()` tümüne abone olunca müşteri
  // seçimi değişince de 30 satırlık sepet yeniden çiziliyordu.
  const lines = useCart((state) => state.lines);
  const selectedLineId = useCart((state) => state.selectedLineId);
  const customer = useCart((state) => state.customer);
  const documentDiscountRate = useCart((state) => state.documentDiscountRate);
  // Eylemler zustand'da SABİT referanslardır; memo'lu alt bileşenler bu sayede
  // her render'da yeniden çizilmiyor.
  const select = useCart((state) => state.select);
  const step = useCart((state) => state.step);
  const removeLine = useCart((state) => state.removeLine);
  const setLineDiscount = useCart((state) => state.setLineDiscount);
  const setLineNote = useCart((state) => state.setLineNote);
  const setDocumentDiscount = useCart((state) => state.setDocumentDiscount);
  const setCustomer = useCart((state) => state.setCustomer);
  const addProduct = useCart((state) => state.addProduct);
  const toast = useToast();

  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [search, setSearch] = useState('');
  const [threshold, setThreshold] = useState('10.00');
  // Tenant ayarı: satış biter bitmez fiş bassın mı.
  const [autoPrint, setAutoPrint] = useState(true);
  const [modal, setModal] = useState<Modal>(null);
  const [parked, setParked] = useState<ParkedSale[]>([]);
  const [completed, setCompleted] = useState<CompletedSale | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  /**
   * Son gösterilen yazıcı uyarısı.
   *
   * Yazıcı gün boyu bozuksa her satışta birebir aynı uyarıyı göstermek 200 satışta
   * 200 toast demek; kasiyer bir süre sonra hepsini yok saymaya başlar. Aynı mesaj
   * arka arkaya tekrarlarsa susulur — sayı zaten üst şeritteki rozette duruyor.
   */
  const lastPrintWarning = useRef<string | null>(null);

  const online = network.state === 'online';
  const allowHighDiscount = session.user.permissions.includes(PERMISSIONS.SALE_DISCOUNT_HIGH);
  const selectedLine = lines.find((line) => line.lineId === selectedLineId) ?? null;

  const breakdown = useMemo(
    () => cartBreakdown(lines, documentDiscountRate),
    [lines, documentDiscountRate],
  );
  const totals = useMemo(() => lineTotals(lines, breakdown), [lines, breakdown]);

  /** Okutulan barkodu çözer; ürün yoksa kasiyeri sessizce bırakmaz. */
  const handleScan = useCallback(
    (code: string) => {
      unwrap(bridge().catalog.scan(code))
        .then((result) => {
          if (!result.product) {
            toast.error(
              'Ürün bulunamadı',
              result.scale ? 'Tartı barkodu tanındı ama ürün eşleşmedi.' : code,
            );
            return;
          }
          useCart.getState().addProduct(result.product, result.quantity ?? undefined);
        })
        .catch((scanError: unknown) => {
          toast.error('Barkod okunamadı', errorMessage(scanError));
        });
    },
    [toast],
  );

  const {
    value: barcodeValue,
    onChange: onBarcodeChange,
    onKeyDown: onBarcodeKeyDown,
    focus: focusBarcode,
    inputRef: barcodeRef,
    reset: resetBarcode,
  } = useBarcodeInput(handleScan);

  // Ayarlar (indirim eşiği) ve ürün listesi yerel önbellekten; ağ gerekmez.
  useEffect(() => {
    unwrap(bridge().catalog.settings())
      .then((settings) => {
        if (!settings) return;
        setThreshold(settings.highDiscountThreshold);
        setAutoPrint(settings.autoPrintReceipt);
      })
      .catch(() => undefined);
  }, [cachedProductCount]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      unwrap(bridge().catalog.search(search))
        .then((items) => {
          if (active) setProducts(items);
        })
        .catch(() => undefined);
    }, 120);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, cachedProductCount]);

  const refreshParked = useCallback(() => {
    unwrap(bridge().sale.parked())
      .then(setParked)
      .catch(() => undefined);
  }, []);

  useEffect(refreshParked, [refreshParked]);

  const pickProduct = useCallback(
    (product: CatalogProduct) => {
      addProduct(product);
      focusBarcode();
    },
    [addProduct, focusBarcode],
  );

  const clearCustomer = useCallback(() => {
    setCustomer(null);
  }, [setCustomer]);

  const closeModal = useCallback(() => {
    setModal(null);
    setPaymentError(null);
    focusBarcode();
  }, [focusBarcode]);

  const park = useCallback(() => {
    const state = useCart.getState();
    if (state.lines.length === 0) return;
    const label = state.customer?.name ?? `${state.lines.length} kalem`;
    unwrap(bridge().sale.park({ label, draft: state.toDraft() }))
      .then(() => {
        state.clear();
        refreshParked();
        toast.success('Satış park edildi');
      })
      .catch((parkError: unknown) => {
        toast.error('Park edilemedi', errorMessage(parkError));
      })
      .finally(focusBarcode);
  }, [focusBarcode, refreshParked, toast]);

  /**
   * Teraziden tartım alır ve SEÇİLİ satırın miktarına yazar.
   *
   * Kararsız (oturmamış) tartım satışa girmez: terazinin üstünde el varken okunan
   * değer müşteriden yanlış para almak demektir.
   */
  const readScale = useCallback(() => {
    const state = useCart.getState();
    const lineId = state.selectedLineId;
    if (!lineId) {
      toast.show({
        tone: 'info',
        title: 'Tartı',
        description: 'Önce tartılacak ürünün satırını seçin.',
      });
      return;
    }
    unwrap(bridge().scale.read())
      .then((reading) => {
        if (!reading.stable) {
          toast.show({
            tone: 'warning',
            title: 'Tartı oturmadı',
            description: 'Terazinin sabitlenmesini bekleyip tekrar deneyin.',
          });
          return;
        }
        useCart.getState().setQuantity(lineId, reading.weightKg);
      })
      .catch((scaleError: unknown) => {
        toast.error('Tartı okunamadı', errorMessage(scaleError));
      })
      .finally(focusBarcode);
  }, [focusBarcode, toast]);

  const runAction = useCallback(
    (action: SaleAction) => {
      const state = useCart.getState();
      switch (action) {
        case 'payment':
          if (state.lines.length === 0) return;
          // Fiş tutarı 0 ise ödeme alınamaz: sunucu sözleşmesi en az bir ödeme
          // kalemi ister ve tutarı sıfır olan ödeme geçerli değil. Kasiyeri boş
          // bir modalda kilitlemek yerine nedeni söylüyoruz.
          if (Number(breakdown.totals.grandTotal) <= 0) {
            toast.show({
              tone: 'warning',
              title: 'Fiş tutarı sıfır',
              description: 'Ücretsiz satış desteklenmiyor; indirimi ya da fiyatı düzeltin.',
            });
            return;
          }
          setModal('payment');
          return;
        case 'customer':
          setModal('customer');
          return;
        case 'discount':
          if (state.lines.length > 0) setModal('discount');
          return;
        case 'park':
          park();
          return;
        case 'parked':
          refreshParked();
          setModal('parked');
          return;
        case 'return':
          setModal('return');
          return;
        case 'note':
          if (state.selectedLineId) setModal('note');
          return;
        case 'clear':
          state.clear();
          focusBarcode();
          return;
        case 'scale':
          readScale();
          return;
        case 'settings':
          onOpenSettings();
          return;
        case 'closeShift':
          // Dolu sepetle kapatmak, kasiyerin üzerinde satış varken çekmeceyi
          // saymasına yol açar; önce sepet bitirilir ya da park edilir.
          if (state.lines.length > 0) {
            toast.show({
              tone: 'warning',
              title: 'Sepet dolu',
              description: 'Vardiyayı kapatmadan önce satışı bitirin ya da park edin (F4).',
            });
            return;
          }
          setModal('close-shift');
          return;
      }
    },
    [
      breakdown.totals.grandTotal,
      focusBarcode,
      onOpenSettings,
      park,
      readScale,
      refreshParked,
      toast,
    ],
  );

  /**
   * Klavye haritası. Dinleyici pencerede: kasiyerin odağı nerede olursa olsun F
   * tuşları çalışmalı. Modal açıkken kısayollar susar — Esc'i ve modalın kendi
   * tuşlarını ezmesin.
   */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (modal !== null || completed !== null) return;

      const action = actionForKey(event.key);
      if (action) {
        event.preventDefault();
        runAction(action);
        return;
      }

      const state = useCart.getState();
      if (event.key === 'Escape') {
        event.preventDefault();
        resetBarcode();
        focusBarcode();
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (state.lines.length === 0) return;
        event.preventDefault();
        state.moveSelection(event.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      // `+`/`−` yalnız barkod alanı BOŞKEN miktar değiştirir; kasiyer barkod
      // yazarken araya giren bir eksi işareti sepeti bozmasın. Değer state'ten
      // DEĞİL alandan okunuyor: state'e bağlanmak dinleyiciyi her tuş vuruşunda
      // söküp yeniden kurardı.
      if (
        (event.key === '+' || event.key === '-') &&
        (barcodeRef.current?.value ?? '') === '' &&
        state.selectedLineId
      ) {
        event.preventDefault();
        state.step(state.selectedLineId, event.key === '+' ? 1 : -1);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [barcodeRef, completed, focusBarcode, modal, resetBarcode, runAction]);

  /**
   * Müşteri ekranını besler.
   *
   * Sepet ya da satış sonucu değiştikçe main process'e durum yollanır; main onu
   * müşteri penceresine iletir. Ekran tanımlı değilse main sessizce yutar —
   * burada "ekran var mı" sorusu sorulmaz, sorumluluk tek yerde kalsın.
   */
  useEffect(() => {
    void unwrap(
      bridge().display.update({
        lines: lines.map((line) => ({
          name: line.name,
          quantity: line.quantity,
          lineTotal: totals.get(line.lineId) ?? '0.00',
        })),
        grandTotal: completed ? completed.grandTotal : breakdown.totals.grandTotal,
        changeDue: completed && Number(completed.changeDue) > 0 ? completed.changeDue : null,
        message: lines.length === 0 && !completed ? 'Hoş geldiniz' : null,
      }),
    ).catch(() => undefined);
  }, [breakdown.totals.grandTotal, completed, lines, totals]);

  // Açılışta ve her modal kapanışında odak barkoda döner.
  useEffect(() => {
    if (modal === null && completed === null) focusBarcode();
  }, [completed, focusBarcode, modal]);

  const openPayment = useCallback(() => {
    runAction('payment');
  }, [runAction]);

  /** Kısayol şeridinde kapalı olacak eylemler — referansı sabit kalsın diye memo'lu. */
  const disabledActions = useMemo(() => {
    const closed = new Set<SaleAction>();
    if (lines.length === 0) {
      closed.add('payment');
      closed.add('discount');
      closed.add('park');
    }
    if (selectedLineId === null) closed.add('note');
    if (!online) closed.add('return');
    return closed;
  }, [lines.length, online, selectedLineId]);

  /**
   * Satış sonrası fiş.
   *
   * Yazdırma satışı ASLA engellemez: hata fırlatmaz, basılamayan fiş kuyruğa
   * alınır ve kasiyer uyarı görür. Nakit satışta çekmece darbesi de aynı işe
   * eklenir (main process karar verir).
   */
  const printSale = useCallback(
    (clientSaleId: string, options: { auto?: boolean } = {}) => {
      unwrap(bridge().printer.printReceipt({ clientSaleId }))
        .then((result) => {
          if (result.printed) {
            lastPrintWarning.current = null;
            return;
          }
          // OTOMATİK basımda, yazıcı hiç tanımlı değilse (kuyruğa da girmediyse)
          // sessiz kalınır: yazıcısı olmayan dükkânda her satışta uyarı çıkarmak
          // gürültüdür. Kasiyer düğmeye BASTIYSA her hâlükârda cevap alır.
          if (options.auto && !result.queued) return;
          const description = result.queued
            ? `${result.message ?? ''} Fiş kuyruğa alındı, yazıcı hazır olunca basılabilir.`
            : (result.message ?? 'Yazıcı tanımlı değil.');
          // Aynı arıza arka arkaya tekrarlıyorsa sus; kasiyer düğmeye BASTIYSA
          // her zaman cevap alır.
          if (options.auto && lastPrintWarning.current === description) return;
          lastPrintWarning.current = description;
          toast.show({ tone: 'warning', title: 'Fiş basılamadı', description });
        })
        .catch((printError: unknown) => {
          toast.error('Fiş basılamadı', errorMessage(printError));
        });
    },
    [toast],
  );

  function submitSale(payments: SalePaymentDraft[]): void {
    setSubmitting(true);
    setPaymentError(null);
    const draft = { ...useCart.getState().toDraft(), payments };
    unwrap(bridge().sale.submit(draft))
      .then((sale) => {
        useCart.getState().clear();
        setModal(null);
        setCompleted(sale);
        if (autoPrint) printSale(sale.clientSaleId, { auto: true });
      })
      .catch((submitError: unknown) => {
        setPaymentError(errorMessage(submitError, 'Satış kaydedilemedi.'));
      })
      .finally(() => {
        setSubmitting(false);
      });
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Sol: sepet + toplam. Kasiyerin bakış merkezi burası. */}
      <section className="border-border flex w-[420px] shrink-0 flex-col border-r">
        <div className="border-border bg-surface-raised border-b p-3">
          <div className="relative">
            <ScanLine
              className="text-ink-subtle pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2"
              aria-hidden
            />
            <Input
              ref={barcodeRef}
              value={barcodeValue}
              onChange={onBarcodeChange}
              onKeyDown={onBarcodeKeyDown}
              placeholder="Barkod okutun ya da yazın"
              aria-label="Barkod"
              autoFocus
              className="h-12 pl-10 text-base"
            />
          </div>
        </div>

        <CartList
          lines={lines}
          totals={totals}
          selectedLineId={selectedLineId}
          onSelect={select}
          onStep={step}
          onRemove={removeLine}
        />

        <TotalsPanel
          totals={breakdown.totals}
          itemCount={lines.length}
          customerName={customer?.name ?? null}
          documentDiscountRate={documentDiscountRate}
          disabled={lines.length === 0}
          onPay={openPayment}
          onClearCustomer={clearCustomer}
        />
      </section>

      {/* Sağ: ürün arama + grid. Barkodu olmayan ürünler için. */}
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="border-border bg-surface-raised border-b p-3">
          <Input
            value={search}
            placeholder="Ürün ara"
            aria-label="Ürün ara"
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />
        </div>
        <ProductGrid products={products} onPick={pickProduct} />
        <ShortcutBar onAction={runAction} disabled={disabledActions} />
      </section>

      {/* Modallar YALNIZ açıkken mount edilir: her açılışta state temiz başlasın,
          "aç ve sıfırla" effect'ine gerek kalmasın. */}
      {modal === 'payment' ? (
        <PaymentDialog
          grandTotal={breakdown.totals.grandTotal}
          customerName={customer?.name ?? null}
          submitting={submitting}
          error={paymentError}
          onClose={closeModal}
          onConfirm={submitSale}
        />
      ) : null}

      {modal === 'customer' ? (
        <CustomerDialog
          onClose={closeModal}
          onSelect={(picked) => {
            setCustomer(picked);
            closeModal();
          }}
        />
      ) : null}

      {modal === 'discount' ? (
        <DiscountDialog
          lineName={selectedLine?.name ?? null}
          currentRate={selectedLine?.discountRate ?? documentDiscountRate}
          threshold={threshold}
          allowHigh={allowHighDiscount}
          onClose={closeModal}
          onApply={(rate) => {
            if (selectedLine) setLineDiscount(selectedLine.lineId, rate);
            else setDocumentDiscount(rate);
            closeModal();
          }}
        />
      ) : null}

      {modal === 'note' && selectedLine ? (
        <NoteDialog
          lineName={selectedLine.name}
          currentNote={selectedLine.note ?? null}
          onClose={closeModal}
          onApply={(note) => {
            setLineNote(selectedLine.lineId, note);
            closeModal();
          }}
        />
      ) : null}

      {modal === 'parked' ? (
        <ParkedDialog
          parked={parked}
          cartBusy={lines.length > 0}
          onClose={closeModal}
          onResume={(id) => {
            unwrap(bridge().sale.unpark(id))
              .then((draft) => {
                useCart.getState().load(draft, new Map(products.map((item) => [item.id, item])));
                refreshParked();
                closeModal();
              })
              .catch((resumeError: unknown) => {
                toast.error('Geri alınamadı', errorMessage(resumeError));
              });
          }}
          onDiscard={(id) => {
            unwrap(bridge().sale.discardParked(id))
              .then(refreshParked)
              .catch(() => undefined);
          }}
        />
      ) : null}

      {modal === 'return' ? (
        <ReturnDialog
          online={online}
          onClose={closeModal}
          onDone={(message) => {
            toast.success('İade tamamlandı', message);
            closeModal();
          }}
        />
      ) : null}

      {modal === 'close-shift' ? (
        <CloseShiftDialog
          onClose={closeModal}
          onClosed={() => {
            setModal(null);
            onShiftClosed();
          }}
        />
      ) : null}

      {completed ? (
        <ReceiptDialog
          sale={completed}
          onClose={() => {
            setCompleted(null);
            focusBarcode();
          }}
          onPrint={() => {
            printSale(completed.clientSaleId);
          }}
        />
      ) : null}

      <span className="sr-only" aria-live="polite">
        {`Vardiya açık, kasa ${config.registerName ?? shift.registerId}`}
      </span>
    </div>
  );
}
