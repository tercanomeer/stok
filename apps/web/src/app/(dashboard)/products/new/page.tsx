'use client';

import type { ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';

import { PageHeader } from '../../../../components/common/page-header';
import { PermissionGate } from '../../../../components/common/permission-gate';
import { ProductForm } from '../../../../components/products/product-form';

export default function NewProductPage(): ReactElement {
  return (
    <PermissionGate permission={PERMISSIONS.PRODUCT_MANAGE}>
      <div className="mx-auto max-w-5xl space-y-5">
        <PageHeader
          title="Yeni ürün"
          description="Kaydettikten sonra görsel ekleyebilir, barkod yönetebilirsiniz."
        />
        <ProductForm />
      </div>
    </PermissionGate>
  );
}
