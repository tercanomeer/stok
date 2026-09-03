'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type ReactElement } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Checkbox,
  Field,
  Input,
  Select,
  Textarea,
  useToast,
} from '@stokk/ui';

import { BarcodeEditor } from './barcode-editor';
import { ProductImage } from './product-image';
import { useBrands, useCategories, useUnits } from '../../hooks/use-catalog';
import { useCreateProduct, useUpdateProduct, type ProductPayload } from '../../hooks/use-products';
import { apiErrorMessage } from '../../lib/api';
import type { Product } from '../../lib/api-types';
import {
  productSchema,
  VAT_RATE_OPTIONS,
  type ProductOutput,
  type ProductValues,
} from '../../lib/catalog-schemas';
import { LinkButton } from '../common/link-button';
import { FormBanner } from '../form-banner';

export interface ProductFormProps {
  /** Verilirse düzenleme, yoksa yeni ürün. */
  product?: Product;
}

function toDefaults(product: Product | undefined): ProductValues {
  return {
    name: product?.name ?? '',
    code: product?.code ?? '',
    categoryId: product?.categoryId ?? '',
    brandId: product?.brandId ?? '',
    unitId: product?.unitId ?? '',
    salePrice: product?.salePrice ?? '',
    vatRate: product?.vatRate ?? 20,
    criticalLevel: product?.criticalLevel ?? '',
    trackStock: product?.trackStock ?? true,
    isWeighed: product?.isWeighed ?? false,
    description: '',
  };
}

/** Boş seçim ("" ) alanı temizler; backend `undefined` bekler, boş string'i reddeder. */
function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Ürün formu — yeni ve düzenleme aynı bileşen; fark barkod/görsel bölümlerinde. */
export function ProductForm({ product }: ProductFormProps): ReactElement {
  const router = useRouter();
  const toast = useToast();
  const categories = useCategories();
  const brands = useBrands();
  const units = useUnits();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const [draftBarcodes, setDraftBarcodes] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<ProductValues, unknown, ProductOutput>({
    resolver: zodResolver(productSchema),
    defaultValues: toDefaults(product),
  });

  const saving = createProduct.isPending || updateProduct.isPending;
  const error = createProduct.error ?? updateProduct.error;
  const trackStock = useWatch({ control, name: 'trackStock' });

  const onSubmit = handleSubmit((values) => {
    const payload: ProductPayload = {
      name: values.name,
      code: optional(values.code),
      categoryId: optional(values.categoryId),
      brandId: optional(values.brandId),
      unitId: values.unitId,
      salePrice: values.salePrice,
      vatRate: values.vatRate,
      criticalLevel: optional(values.criticalLevel),
      trackStock: values.trackStock,
      isWeighed: values.isWeighed,
      description: optional(values.description),
    };

    if (product) {
      updateProduct.mutate(
        { id: product.id, payload },
        {
          onSuccess: () => {
            toast.success('Ürün güncellendi', values.name);
          },
        },
      );
      return;
    }

    createProduct.mutate(
      { ...payload, ...(draftBarcodes.length > 0 ? { barcodes: draftBarcodes } : {}) },
      {
        onSuccess: (created) => {
          toast.success('Ürün eklendi', created.name);
          router.replace(`/products/${created.id}`);
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
      {error ? <FormBanner message={apiErrorMessage(error)} /> : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Ürün bilgileri</CardTitle>
          </CardHeader>
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Ürün adı" required error={errors.name?.message} className="sm:col-span-2">
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  autoFocus
                  aria-describedby={describedBy}
                  invalid={Boolean(errors.name)}
                  {...register('name')}
                />
              )}
            </Field>

            <Field label="Stok kodu" error={errors.code?.message}>
              {({ id, describedBy }) => (
                <Input id={id} aria-describedby={describedBy} {...register('code')} />
              )}
            </Field>

            <Field label="Birim" required error={errors.unitId?.message}>
              {({ id, describedBy }) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  invalid={Boolean(errors.unitId)}
                  {...register('unitId')}
                >
                  <option value="">Seçin…</option>
                  {(units.data ?? []).map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name} ({unit.abbreviation})
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Kategori" error={errors.categoryId?.message}>
              {({ id, describedBy }) => (
                <Select id={id} aria-describedby={describedBy} {...register('categoryId')}>
                  <option value="">Kategorisiz</option>
                  {(categories.data ?? []).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Marka" error={errors.brandId?.message}>
              {({ id, describedBy }) => (
                <Select id={id} aria-describedby={describedBy} {...register('brandId')}>
                  <option value="">Markasız</option>
                  {(brands.data ?? []).map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field
              label="Satış fiyatı (KDV dahil)"
              required
              error={errors.salePrice?.message}
              hint="Örnek: 12,50"
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  inputMode="decimal"
                  className="tabular"
                  aria-describedby={describedBy}
                  invalid={Boolean(errors.salePrice)}
                  {...register('salePrice')}
                />
              )}
            </Field>

            <Field label="KDV oranı" required error={errors.vatRate?.message}>
              {({ id, describedBy }) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  invalid={Boolean(errors.vatRate)}
                  {...register('vatRate')}
                >
                  {VAT_RATE_OPTIONS.map((rate) => (
                    <option key={rate} value={rate}>
                      %{rate}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Açıklama" error={errors.description?.message} className="sm:col-span-2">
              {({ id, describedBy }) => (
                <Textarea id={id} aria-describedby={describedBy} {...register('description')} />
              )}
            </Field>
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Stok</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <label className="flex items-start gap-2.5 text-sm">
                <Checkbox className="mt-0.5" {...register('trackStock')} />
                <span>
                  <span className="text-ink font-medium">Stok takibi yapılsın</span>
                  <span className="text-ink-muted block">
                    Kapalıysa satış ve alış bu üründe stok hareketi üretmez (hizmet kalemi).
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-2.5 text-sm">
                <Checkbox className="mt-0.5" {...register('isWeighed')} />
                <span>
                  <span className="text-ink font-medium">Tartılı ürün</span>
                  <span className="text-ink-muted block">
                    Terazi barkodundan gelen ağırlık/tutar bu üründe kullanılır.
                  </span>
                </span>
              </label>

              <Field
                label="Kritik seviye"
                error={errors.criticalLevel?.message}
                hint="Bu miktarın altına inince uyarı verilir. Boş bırakılırsa uyarı yok."
              >
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    inputMode="decimal"
                    className="tabular"
                    disabled={!trackStock}
                    aria-describedby={describedBy}
                    invalid={Boolean(errors.criticalLevel)}
                    {...register('criticalLevel')}
                  />
                )}
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Barkodlar</CardTitle>
            </CardHeader>
            <CardBody>
              <BarcodeEditor
                {...(product ? { productId: product.id } : {})}
                barcodes={product?.barcodes ?? []}
                onDraftChange={setDraftBarcodes}
              />
            </CardBody>
          </Card>

          {product ? (
            <Card>
              <CardHeader>
                <CardTitle>Görsel</CardTitle>
              </CardHeader>
              <CardBody>
                <ProductImage productId={product.id} imageUrl={product.imageUrl} />
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <LinkButton href="/products" variant="outline">
          Vazgeç
        </LinkButton>
        <Button type="submit" loading={saving}>
          <Save aria-hidden />
          {product ? 'Değişiklikleri kaydet' : 'Ürünü kaydet'}
        </Button>
      </div>
    </form>
  );
}
