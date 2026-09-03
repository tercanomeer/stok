'use client';

import type { ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';

import { CatalogManager } from '../../../../components/catalog/catalog-manager';
import { PageHeader } from '../../../../components/common/page-header';
import { PermissionGate } from '../../../../components/common/permission-gate';

export default function CatalogPage(): ReactElement {
  return (
    <PermissionGate permission={PERMISSIONS.CATALOG_MANAGE}>
      <div className="mx-auto max-w-4xl space-y-5">
        <PageHeader
          title="Kategori · Marka · Birim"
          description="Ürünlerin bağlandığı katalog kayıtları."
        />
        <CatalogManager />
      </div>
    </PermissionGate>
  );
}
