'use client';

import { Suspense, type ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';

import { PageFallback } from '../../../../components/common/page-fallback';
import { PageHeader } from '../../../../components/common/page-header';
import { PermissionGate } from '../../../../components/common/permission-gate';
import { ImportWizard } from '../../../../components/products/import-wizard';

export default function ImportPage(): ReactElement {
  return (
    <PermissionGate permission={PERMISSIONS.PRODUCT_IMPORT}>
      <div className="mx-auto max-w-5xl space-y-5">
        <PageHeader
          title="Ürünleri içe aktar"
          description="Excel dosyanızdaki sütunları eşleyin, önizleyin ve toplu aktarın."
        />
        {/* Sihirbaz iş kimliğini URL'de tutuyor (`useSearchParams`); prerender için Suspense şart. */}
        <Suspense fallback={<PageFallback />}>
          <ImportWizard />
        </Suspense>
      </div>
    </PermissionGate>
  );
}
