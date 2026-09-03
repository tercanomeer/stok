'use client';

import { ImagePlus, Loader2 } from 'lucide-react';
import { useRef, type ReactElement } from 'react';

import { useToast } from '@stokk/ui';

import { useUploadProductImage } from '../../hooks/use-products';
import { apiErrorMessage } from '../../lib/api';

export interface ProductImageProps {
  productId: string;
  imageUrl: string | null;
}

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Ürün görseli. Yükleme yalnız KAYITLI üründe mümkün (uç `/products/:id/image`);
 * yeni ürün formunda bu bölüm gösterilmez. Boyut/tür denetimi sunucuda da yapılır,
 * buradaki ön kontrol kullanıcıyı boş yere beklemekten kurtarır.
 */
export function ProductImage({ productId, imageUrl }: ProductImageProps): ReactElement {
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadProductImage();
  const toast = useToast();

  return (
    <div className="flex items-center gap-4">
      <div className="rounded-card border-border bg-surface-sunken flex size-24 shrink-0 items-center justify-center overflow-hidden border">
        {upload.isPending ? (
          <Loader2 className="text-ink-muted size-5 animate-spin" aria-hidden />
        ) : imageUrl ? (
          // Görsel S3/MinIO'dan gelir; next/image uzak alan yapılandırması Faz 15'te
          // (imza/CDN kararıyla birlikte). Şimdilik düz <img>.
          <img src={imageUrl} alt="Ürün görseli" className="size-full object-cover" />
        ) : (
          <ImagePlus className="text-ink-subtle size-6" aria-hidden />
        )}
      </div>

      <div className="space-y-1">
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          aria-label="Ürün görseli seç"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            if (file.size > MAX_BYTES) {
              toast.error('Görsel çok büyük', 'En fazla 5 MB yükleyebilirsiniz.');
              return;
            }
            upload.mutate(
              { productId, file },
              {
                onSuccess: () => {
                  toast.success('Görsel yüklendi');
                },
                onError: (error) => {
                  toast.error('Görsel yüklenemedi', apiErrorMessage(error));
                },
              },
            );
          }}
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="rounded-control border-border-strong text-ink hover:bg-surface-sunken inline-flex h-9 items-center gap-2 border px-3 text-sm font-medium"
        >
          <ImagePlus className="size-4" aria-hidden />
          {imageUrl ? 'Görseli değiştir' : 'Görsel yükle'}
        </button>
        <p className="text-ink-muted text-xs">PNG, JPEG veya WebP · en fazla 5 MB</p>
      </div>
    </div>
  );
}
