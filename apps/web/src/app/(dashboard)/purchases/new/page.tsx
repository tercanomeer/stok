'use client';

import type { ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';

import { PageHeader } from '../../../../components/common/page-header';
import { PermissionGate } from '../../../../components/common/permission-gate';
import { PurchaseForm } from '../../../../components/purchases/purchase-form';

export default function NewPurchasePage(): ReactElement {
  return (
    <PermissionGate permission={PERMISSIONS.PURCHASE_MANAGE}>
      <div className="mx-auto max-w-6xl space-y-5">
        <PageHeader
          title="Yeni alış faturası"
          description="Kaydettiğinizde stok, ortalama maliyet ve tedarikçi borcu tek seferde işlenir."
        />
        <PurchaseForm />
      </div>
    </PermissionGate>
  );
}
