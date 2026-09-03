'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Check, Percent, RotateCcw } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  formatCount,
  formatMoney,
  Input,
  Select,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useToast,
} from '@stokk/ui';

import { useBrands, useCategories } from '../../hooks/use-catalog';
import { useBulkPrice, type BulkPricePayload } from '../../hooks/use-products';
import { apiErrorMessage } from '../../lib/api';
import type { BulkPricePreviewItem } from '../../lib/api-types';
import {
  bulkPriceSchema,
  type BulkPriceOutput,
  type BulkPriceValues,
} from '../../lib/catalog-schemas';
import { FormBanner } from '../form-banner';

/**
 * Toplu fiyat güncelleme: filtre → yüzde/tutar → ÖNİZLEME → uygula.
 * Önizleme sunucuda hesaplanır (aynı Decimal mantığı) ve fiyatı DEĞİŞTİRMEZ;
 * uygula adımı ayrı bir çağrıdır. Kullanıcı ne olacağını görmeden fiyat değişmez.
 */
export function BulkPriceForm(): ReactElement {
  const categories = useCategories();
  const brands = useBrands();
  const bulkPrice = useBulkPrice();
  const toast = useToast();
  const [preview, setPreview] = useState<{
    payload: BulkPricePayload;
    items: BulkPricePreviewItem[];
  } | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<BulkPriceValues, unknown, BulkPriceOutput>({
    resolver: zodResolver(bulkPriceSchema),
    defaultValues: { mode: 'percent', value: '', categoryId: '', brandId: '' },
  });

  const mode = useWatch({ control, name: 'mode' });

  const onPreview = handleSubmit((values) => {
    const payload: BulkPricePayload = {
      mode: values.mode,
      value: values.value,
      ...(values.categoryId ? { categoryId: values.categoryId } : {}),
      ...(values.brandId ? { brandId: values.brandId } : {}),
    };
    bulkPrice.mutate(
      { ...payload, preview: true },
      {
        onSuccess: (result) => {
          setPreview({ payload, items: result.items ?? [] });
        },
      },
    );
  });

  function applyChanges(): void {
    if (!preview) return;
    bulkPrice.mutate(preview.payload, {
      onSuccess: (result) => {
        toast.success('Fiyatlar güncellendi', `${formatCount(result.affected)} ürün etkilendi.`);
        setPreview(null);
      },
    });
  }

  const scope = useWatch({ control, name: ['categoryId', 'brandId'] });
  const hasFilter = scope.some(Boolean);

  return (
    <div className="space-y-5">
      {bulkPrice.isError ? <FormBanner message={apiErrorMessage(bulkPrice.error)} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Kapsam ve değişim</CardTitle>
        </CardHeader>
        <CardBody>
          <form
            onSubmit={(e) => {
              void onPreview(e);
            }}
            noValidate
            className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <Field label="Kategori">
              {({ id }) => (
                <Select id={id} {...register('categoryId')}>
                  <option value="">Tüm kategoriler</option>
                  {(categories.data ?? []).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Marka">
              {({ id }) => (
                <Select id={id} {...register('brandId')}>
                  <option value="">Tüm markalar</option>
                  {(brands.data ?? []).map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Değişim türü">
              {({ id }) => (
                <Select id={id} {...register('mode')}>
                  <option value="percent">Yüzde (%)</option>
                  <option value="amount">Tutar (TL)</option>
                </Select>
              )}
            </Field>

            <Field
              label={mode === 'percent' ? 'Oran' : 'Tutar'}
              required
              error={errors.value?.message}
              hint={mode === 'percent' ? '10 = %10 zam, -5 = %5 indirim' : '2,50 = 2,50 TL zam'}
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  inputMode="decimal"
                  className="tabular"
                  aria-describedby={describedBy}
                  invalid={Boolean(errors.value)}
                  {...register('value')}
                />
              )}
            </Field>

            <div className="sm:col-span-2 lg:col-span-4">
              {!hasFilter ? (
                <p className="text-warning mb-3 text-sm">
                  Filtre seçilmedi — değişiklik <strong>tüm ürünlere</strong> uygulanacak.
                </p>
              ) : null}
              <Button type="submit" loading={bulkPrice.isPending && !preview}>
                <Percent aria-hidden />
                Önizle
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {preview ? (
        <Card>
          <CardHeader>
            <CardTitle>Önizleme — {formatCount(preview.items.length)} ürün</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            {preview.items.length === 0 ? (
              <EmptyState
                title="Bu kapsamda ürün yok"
                description="Filtreyi değiştirip tekrar önizleyin."
              />
            ) : (
              <>
                <div className="border-border rounded-control max-h-96 overflow-y-auto border">
                  <Table>
                    <THead>
                      <TR className="hover:bg-transparent">
                        <TH>Ürün</TH>
                        <TH numeric>Eski fiyat</TH>
                        <TH numeric>Yeni fiyat</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {preview.items.map((item) => (
                        <TR key={item.id}>
                          <TD>{item.name}</TD>
                          <TD numeric className="text-ink-muted">
                            {formatMoney(item.oldPrice)}
                          </TD>
                          <TD numeric className="font-medium">
                            {formatMoney(item.newPrice)}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setPreview(null);
                    }}
                  >
                    <RotateCcw aria-hidden />
                    Vazgeç
                  </Button>
                  <Button loading={bulkPrice.isPending} onClick={applyChanges}>
                    <Check aria-hidden />
                    {formatCount(preview.items.length)} ürünü güncelle
                  </Button>
                </div>
              </>
            )}
          </CardBody>
        </Card>
      ) : (
        <p className="text-ink-muted flex items-center gap-2 text-sm">
          <ArrowRight className="size-4" aria-hidden />
          Önizlemeden geçmeden fiyatlar değişmez.
        </p>
      )}
    </div>
  );
}
