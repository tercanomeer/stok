'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ScanBarcode, Save, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';

import { calculatePurchaseBreakdown, type PurchaseLineInput } from '@stokk/pos-core';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Field,
  formatMoney,
  formatQuantity,
  Input,
  Select,
  Table,
  TBody,
  TD,
  TH,
  THead,
  Textarea,
  TR,
  useToast,
} from '@stokk/ui';

import { ProductPicker } from './product-picker';
import { useContacts } from '../../hooks/use-contacts';
import { useCreatePurchase, type PurchaseItemPayload } from '../../hooks/use-purchases';
import { apiErrorMessage } from '../../lib/api';
import type { Product } from '../../lib/api-types';
import { toDecimalString, VAT_RATE_OPTIONS } from '../../lib/catalog-schemas';
import { purchaseHeaderSchema, type PurchaseHeaderValues } from '../../lib/finance-schemas';
import { parseListParams } from '../../lib/list-params';
import { quantitySum } from '../../lib/quantity';
import { LinkButton } from '../common/link-button';
import { FormBanner } from '../form-banner';

/** Tedarikçi listesi — alışta yalnız tedarikçi (ve iki taraflı) cariler seçilebilir. */
const SUPPLIER_PARAMS = parseListParams('limit=100&type=SUPPLIER', { filterKeys: ['type'] });

interface DraftLine {
  key: string;
  product: Product;
  quantity: string;
  unitPrice: string;
  discountRate: string;
  vatRate: number;
}

function today(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/**
 * Satırın kendi doğrulaması. Hata varsa satır hesaba KATILMAZ ve kullanıcıya
 * nedeni satırın altında yazılır — sessizce kaybolan kalem olmaz.
 */
function lineError(line: DraftLine): string | null {
  const quantity = Number.parseFloat(toDecimalString(line.quantity));
  if (!Number.isFinite(quantity) || quantity <= 0) return 'Miktar sıfırdan büyük olmalı.';
  if (line.unitPrice.trim() === '') return 'Birim fiyat girin.';
  const unitPrice = Number.parseFloat(toDecimalString(line.unitPrice));
  if (!Number.isFinite(unitPrice) || unitPrice < 0) return 'Geçerli bir birim fiyat girin.';
  if (line.discountRate.trim() !== '') {
    const discount = Number.parseFloat(toDecimalString(line.discountRate));
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
      return 'İskonto 0-100 aralığında olmalı.';
    }
  }
  return null;
}

/** Yalnız hatasız satırlardan pos-core girdisi. */
function toCalcLines(lines: DraftLine[]): PurchaseLineInput[] {
  return lines
    .filter((line) => lineError(line) === null)
    .map((line) => ({
      productId: line.product.id,
      quantity: toDecimalString(line.quantity),
      unitPrice: toDecimalString(line.unitPrice),
      vatRate: line.vatRate,
      ...(line.discountRate ? { discountRate: toDecimalString(line.discountRate) } : {}),
    }));
}

/**
 * Alış faturası girişi. Kalemler barkodla eklenir (kasa alışkanlığı), toplamlar
 * `@stokk/pos-core` ile hesaplanır — sunucu kaydederken AYNI fonksiyonu çağırır,
 * ekranda görülen tutar ile kaydedilen tutar ayrışamaz.
 *
 * Stok etkisi önizlemesi: her satırda mevcut stok → fatura sonrası stok. Ürünün
 * `stockQuantity` alanı listeden gelir; kaydetmeden önce ne olacağı görünür.
 */
export function PurchaseForm(): ReactElement {
  const router = useRouter();
  const toast = useToast();
  const suppliers = useContacts(SUPPLIER_PARAMS);
  const createPurchase = useCreatePurchase();
  const [lines, setLines] = useState<DraftLine[]>([]);
  const pickerRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PurchaseHeaderValues>({
    resolver: zodResolver(purchaseHeaderSchema),
    defaultValues: { contactId: '', invoiceNo: '', invoiceDate: today(), note: '' },
  });

  const lineErrors = useMemo(
    () => new Map(lines.map((line) => [line.key, lineError(line)] as const)),
    [lines],
  );
  const invalidCount = [...lineErrors.values()].filter(Boolean).length;

  const breakdown = useMemo(() => {
    const calcLines = toCalcLines(lines);
    if (calcLines.length === 0) return null;
    try {
      return calculatePurchaseBreakdown({ lines: calcLines });
    } catch {
      // Satır doğrulaması pos-core kurallarını yansıtıyor; buraya düşmek beklenmez.
      // Yine de tek kaynak pos-core olduğu için hatası yutulup toplam gizlenir.
      return null;
    }
  }, [lines]);

  /**
   * Sonuçlar ÜRÜN KİMLİĞİYLE eşlenir, index ile DEĞİL: `breakdown.lines` yalnız
   * hatasız satırları içerir, `lines` hepsini. Index ile eşlemek bir satır geçersiz
   * olduğunda sonraki satırların tutarını yanlış satırda gösterirdi.
   */
  const resultByProduct = useMemo(
    () => new Map((breakdown?.lines ?? []).map((line) => [line.productId, line] as const)),
    [breakdown],
  );

  function addProduct(product: Product): void {
    setLines((prev) => {
      const existing = prev.find((line) => line.product.id === product.id);
      if (existing) {
        // Aynı ürün tekrar okutulursa miktar artar (kasa alışkanlığı).
        // `quantitySum` virgüllü girişi ve bozuk değeri güvenle karşılar; ham
        // `parseFloat("2,5") + 1` sessizce 3 yazardı, boş alanda "NaN" bırakırdı.
        return prev.map((line) =>
          line.product.id === product.id
            ? { ...line, quantity: quantitySum(toDecimalString(line.quantity), '1') }
            : line,
        );
      }
      return [
        ...prev,
        {
          key: product.id,
          product,
          quantity: '1',
          unitPrice: '',
          discountRate: '',
          vatRate: product.vatRate,
        },
      ];
    });
    pickerRef.current?.focus();
  }

  function updateLine(key: string, patch: Partial<DraftLine>): void {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  /** Kaydet neden pasif? Sessiz kilit bırakmamak için nedeni ekranda yazılır. */
  const blockReason =
    lines.length === 0
      ? 'Faturaya en az bir kalem ekleyin.'
      : invalidCount > 0
        ? `${invalidCount} satırda eksik veya hatalı giriş var — düzeltin.`
        : breakdown === null
          ? 'Kalemlerin miktar ve birim fiyatını girin.'
          : null;

  const onSubmit = handleSubmit((values) => {
    const calcLines = toCalcLines(lines);
    if (calcLines.length === 0) {
      toast.error('Fatura boş', 'En az bir kalem ekleyin ve birim fiyat girin.');
      return;
    }
    const items: PurchaseItemPayload[] = calcLines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      vatRate: line.vatRate,
      ...(line.discountRate ? { discountRate: line.discountRate } : {}),
    }));

    createPurchase.mutate(
      {
        contactId: values.contactId,
        invoiceDate: new Date(`${values.invoiceDate}T00:00:00`).toISOString(),
        items,
        ...(values.invoiceNo ? { invoiceNo: values.invoiceNo } : {}),
        ...(values.note ? { note: values.note } : {}),
      },
      {
        onSuccess: (purchase) => {
          toast.success('Alış faturası kaydedildi', formatMoney(purchase.grandTotal));
          router.replace(`/purchases/${purchase.id}`);
        },
      },
    );
  });

  return (
    <form
      onSubmit={(e) => {
        void onSubmit(e);
      }}
      noValidate
      className="space-y-5"
    >
      {createPurchase.isError ? (
        <FormBanner message={apiErrorMessage(createPurchase.error)} />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Fatura bilgileri</CardTitle>
        </CardHeader>
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Tedarikçi" required error={errors.contactId?.message}>
            {({ id, describedBy }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                invalid={Boolean(errors.contactId)}
                {...register('contactId')}
              >
                <option value="">Seçin…</option>
                {(suppliers.data?.items ?? []).map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Fatura no" error={errors.invoiceNo?.message}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                className="tabular"
                aria-describedby={describedBy}
                {...register('invoiceNo')}
              />
            )}
          </Field>

          <Field label="Fatura tarihi" required error={errors.invoiceDate?.message}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                type="date"
                aria-describedby={describedBy}
                invalid={Boolean(errors.invoiceDate)}
                {...register('invoiceDate')}
              />
            )}
          </Field>

          <Field label="Not" error={errors.note?.message} className="sm:col-span-3">
            {({ id, describedBy }) => (
              <Textarea id={id} rows={2} aria-describedby={describedBy} {...register('note')} />
            )}
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kalemler</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <ProductPicker ref={pickerRef} onSelect={addProduct} />

          {lines.length === 0 ? (
            <p className="text-ink-muted flex items-center gap-2 text-sm">
              <ScanBarcode className="size-4" aria-hidden />
              Barkod okutun veya ürün adı yazıp seçin.
            </p>
          ) : (
            <div className="border-border rounded-control overflow-hidden border">
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>Ürün</TH>
                    <TH numeric>Miktar</TH>
                    <TH numeric>Birim fiyat (KDV hariç)</TH>
                    <TH numeric>İskonto %</TH>
                    <TH numeric>KDV</TH>
                    <TH numeric>Satır toplamı</TH>
                    <TH numeric>Stok etkisi</TH>
                    <TH className="w-10" />
                  </TR>
                </THead>
                <TBody>
                  {lines.map((line) => {
                    const result = resultByProduct.get(line.product.id);
                    const error = lineErrors.get(line.key) ?? null;
                    return (
                      <TR key={line.key} className={error ? 'bg-danger-weak/40' : undefined}>
                        <TD>
                          <span className="text-ink font-medium">{line.product.name}</span>
                          {error ? (
                            <span className="text-danger block text-xs" role="alert">
                              {error}
                            </span>
                          ) : null}
                        </TD>
                        <TD numeric>
                          <Input
                            className="tabular h-9 w-24 text-right"
                            inputMode="decimal"
                            invalid={Boolean(error)}
                            aria-label={`${line.product.name} miktarı`}
                            value={line.quantity}
                            onChange={(e) => {
                              updateLine(line.key, { quantity: e.target.value });
                            }}
                          />
                        </TD>
                        <TD numeric>
                          <Input
                            className="tabular h-9 w-28 text-right"
                            inputMode="decimal"
                            invalid={Boolean(error)}
                            aria-label={`${line.product.name} birim fiyatı`}
                            value={line.unitPrice}
                            onChange={(e) => {
                              updateLine(line.key, { unitPrice: e.target.value });
                            }}
                          />
                        </TD>
                        <TD numeric>
                          <Input
                            className="tabular h-9 w-20 text-right"
                            inputMode="decimal"
                            aria-label={`${line.product.name} iskonto oranı`}
                            value={line.discountRate}
                            onChange={(e) => {
                              updateLine(line.key, { discountRate: e.target.value });
                            }}
                          />
                        </TD>
                        <TD numeric>
                          <Select
                            className="h-9 w-24"
                            aria-label={`${line.product.name} KDV oranı`}
                            value={String(line.vatRate)}
                            onChange={(e) => {
                              updateLine(line.key, {
                                vatRate: Number.parseInt(e.target.value, 10),
                              });
                            }}
                          >
                            {VAT_RATE_OPTIONS.map((rate) => (
                              <option key={rate} value={rate}>
                                %{rate}
                              </option>
                            ))}
                          </Select>
                        </TD>
                        <TD numeric className="font-medium">
                          {result ? formatMoney(result.lineGrandTotal) : '—'}
                        </TD>
                        <TD numeric className="text-ink-muted">
                          <StockEffect product={line.product} quantity={line.quantity} />
                        </TD>
                        <TD>
                          <button
                            type="button"
                            aria-label={`${line.product.name} kalemini kaldır`}
                            onClick={() => {
                              setLines((prev) => prev.filter((l) => l.key !== line.key));
                            }}
                            className="rounded-control text-ink-muted hover:bg-danger-weak hover:text-danger inline-flex size-8 items-center justify-center"
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </button>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>
          )}
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <dl className="rounded-card border-border bg-surface-raised min-w-72 space-y-1 border p-4 text-sm">
          <TotalRow label="Ara toplam (KDV hariç)" value={breakdown?.totals.subtotal} />
          <TotalRow label="İskonto" value={breakdown?.totals.discountTotal} />
          <TotalRow label="KDV" value={breakdown?.totals.vatTotal} />
          <div className="border-border mt-2 flex justify-between border-t pt-2 text-base font-semibold">
            <dt>Genel toplam</dt>
            <dd className="tabular">{formatMoney(breakdown?.totals.grandTotal ?? '0')}</dd>
          </div>
        </dl>

        <div className="flex flex-col items-end gap-2">
          {blockReason ? (
            <p className="text-warning text-sm" role="status">
              {blockReason}
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <LinkButton href="/purchases" variant="outline">
              Vazgeç
            </LinkButton>
            <Button
              type="submit"
              loading={createPurchase.isPending}
              disabled={blockReason !== null}
            >
              <Save aria-hidden />
              Faturayı kaydet
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}

function TotalRow({ label, value }: { label: string; value: string | undefined }): ReactElement {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="tabular">{formatMoney(value ?? '0')}</dd>
    </div>
  );
}

/**
 * Stok etkisi önizlemesi: mevcut → fatura sonrası. Sunucu aynı miktarı girdi olarak
 * yazacağı için gösterilen sonuç gerçekleşenle birebir aynıdır (Faz 10 doğrulaması).
 */
function StockEffect({ product, quantity }: { product: Product; quantity: string }): ReactElement {
  const added = Number.parseFloat(toDecimalString(quantity));
  if (!product.trackStock) return <span className="text-ink-subtle">takipsiz</span>;
  if (!Number.isFinite(added) || added <= 0) {
    return <span>{formatQuantity(product.stockQuantity)}</span>;
  }
  return (
    <span>
      {formatQuantity(product.stockQuantity)} →{' '}
      <span className="text-success font-medium">
        {formatQuantity(quantitySum(product.stockQuantity, toDecimalString(quantity)))}
      </span>
    </span>
  );
}
