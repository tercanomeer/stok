'use client';

import { useParams } from 'next/navigation';
import type { ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';
import { Badge, Spinner } from '@stokk/ui';

import { LinkButton } from '../../../../components/common/link-button';
import { PageHeader } from '../../../../components/common/page-header';
import { PermissionGate } from '../../../../components/common/permission-gate';
import { FormBanner } from '../../../../components/form-banner';
import { ProductForm } from '../../../../components/products/product-form';
import { useProduct } from '../../../../hooks/use-products';
import { apiErrorMessage } from '../../../../lib/api';

export default function EditProductPage(): ReactElement {
  const params = useParams<{ id: string }>();
  const product = useProduct(params.id);

  return (
    <PermissionGate permission={PERMISSIONS.PRODUCT_VIEW}>
      <div className="mx-auto max-w-5xl space-y-5">
        <PageHeader
          title={product.data?.name ?? 'Ürün'}
          description="Ürün bilgileri, barkodlar ve görsel."
          actions={
            <LinkButton href={`/stock/movements?productId=${params.id}`} variant="outline">
              Stok hareketleri
            </LinkButton>
          }
        />

        {product.isPending ? (
          <div className="flex h-64 items-center justify-center">
            <Spinner label="Ürün yükleniyor" />
          </div>
        ) : product.isError ? (
          <FormBanner message={apiErrorMessage(product.error)} />
        ) : (
          <>
            {!product.data.isActive ? (
              <Badge tone="neutral">Bu ürün pasif — satış ekranında görünmez.</Badge>
            ) : null}
            <ProductForm product={product.data} />
          </>
        )}
      </div>
    </PermissionGate>
  );
}
