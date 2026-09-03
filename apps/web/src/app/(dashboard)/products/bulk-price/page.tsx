'use client';

import type { ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';

import { PageHeader } from '../../../../components/common/page-header';
import { PermissionGate } from '../../../../components/common/permission-gate';
import { BulkPriceForm } from '../../../../components/products/bulk-price-form';

export default function BulkPricePage(): ReactElement {
  return (
    <PermissionGate permission={PERMISSIONS.PRODUCT_PRICE_BULK_UPDATE}>
      <div className="mx-auto max-w-5xl space-y-5">
        <PageHeader
          title="Toplu fiyat güncelleme"
          description="Seçtiğiniz kapsamdaki ürünlerin satış fiyatını yüzde veya tutar olarak değiştirin."
        />
        <BulkPriceForm />
      </div>
    </PermissionGate>
  );
}
