'use client';

import { Suspense, type ReactElement } from 'react';

import { PageFallback } from '../../../components/common/page-fallback';
import { ProductList } from '../../../components/products/product-list';

/** Liste durumu URL'de yaşıyor (`useSearchParams`); Suspense sınırı prerender için şart. */
export default function ProductsPage(): ReactElement {
  return (
    <Suspense fallback={<PageFallback />}>
      <ProductList />
    </Suspense>
  );
}
