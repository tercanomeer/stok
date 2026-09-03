'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { PencilLine, Plus, Trash2 } from 'lucide-react';
import { useRef, useState, type ReactElement } from 'react';
import { useForm, type FieldValues, type UseFormReturn } from 'react-hook-form';

import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  EmptyState,
  Field,
  Input,
  Select,
  useToast,
} from '@stokk/ui';

import {
  nameById,
  useBrands,
  useCategories,
  useDeleteCatalogItem,
  useSaveCatalogItem,
  useUnits,
} from '../../hooks/use-catalog';
import { apiErrorMessage } from '../../lib/api';
import type { Brand, Category, Unit } from '../../lib/api-types';
import {
  brandSchema,
  categorySchema,
  unitSchema,
  type BrandValues,
  type CategoryValues,
  type UnitValues,
} from '../../lib/catalog-schemas';
import { ConfirmDialog } from '../common/confirm-dialog';
import { DataTable, type Column } from '../common/data-table';
import { FormBanner } from '../form-banner';

type Resource = 'categories' | 'brands' | 'units';

const TABS: { key: Resource; label: string }[] = [
  { key: 'categories', label: 'Kategoriler' },
  { key: 'brands', label: 'Markalar' },
  { key: 'units', label: 'Birimler' },
];

/**
 * Kategori / marka / birim yönetimi — üçü aynı desende: liste + dialog form + silme onayı.
 *
 * Sekmeler ARIA "tabs" desenini TAM uygular: gezinme sol/sağ ok tuşlarıyla, sekme
 * sırasında yalnız seçili sekme durur (roving tabindex), her sekme kendi paneline
 * `aria-controls` ile bağlıdır. Yarım uygulanmış tablist, hiç uygulanmamıştan kötüdür:
 * okuyucu "3 sekmeden 1." der ama ok tuşları çalışmaz.
 */
export function CatalogManager(): ReactElement {
  const [tab, setTab] = useState<Resource>('categories');
  const tabRefs = useRef<Partial<Record<Resource, HTMLButtonElement | null>>>({});

  function moveTab(index: number, offset: number): void {
    const next = TABS[(index + offset + TABS.length) % TABS.length];
    if (!next) return;
    setTab(next.key);
    tabRefs.current[next.key]?.focus();
  }

  return (
    <div className="space-y-5">
      <div className="border-border flex gap-1 border-b" role="tablist" aria-label="Katalog türü">
        {TABS.map((item, index) => (
          <button
            key={item.key}
            id={`catalog-tab-${item.key}`}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            aria-controls={`catalog-panel-${item.key}`}
            tabIndex={tab === item.key ? 0 : -1}
            ref={(node) => {
              tabRefs.current[item.key] = node;
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') {
                e.preventDefault();
                moveTab(index, -1);
              } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                moveTab(index, 1);
              } else if (e.key === 'Home') {
                e.preventDefault();
                moveTab(0, 0);
              } else if (e.key === 'End') {
                e.preventDefault();
                moveTab(TABS.length - 1, 0);
              }
            }}
            onClick={() => {
              setTab(item.key);
            }}
            className={
              tab === item.key
                ? 'border-brand text-ink -mb-px border-b-2 px-3 py-2 text-sm font-medium'
                : 'text-ink-muted hover:text-ink -mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium'
            }
          >
            {item.label}
          </button>
        ))}
      </div>

      {TABS.map((item) =>
        tab === item.key ? (
          <div
            key={item.key}
            role="tabpanel"
            id={`catalog-panel-${item.key}`}
            aria-labelledby={`catalog-tab-${item.key}`}
          >
            {item.key === 'categories' ? <CategoryPanel /> : null}
            {item.key === 'brands' ? <BrandPanel /> : null}
            {item.key === 'units' ? <UnitPanel /> : null}
          </div>
        ) : null,
      )}
    </div>
  );
}

interface PanelShellProps<T extends { id: string }> {
  addLabel: string;
  emptyTitle: string;
  columns: Column<T>[];
  rows: T[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onAdd: () => void;
}

/** Üç panelin ortak iskeleti: eylem çubuğu + tablo. */
function PanelShell<T extends { id: string }>({
  addLabel,
  emptyTitle,
  columns,
  rows,
  loading,
  error,
  onRetry,
  onAdd,
}: PanelShellProps<T>): ReactElement {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={onAdd}>
          <Plus aria-hidden />
          {addLabel}
        </Button>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={loading}
        error={error}
        onRetry={onRetry}
        empty={<EmptyState title={emptyTitle} description="İlk kaydı ekleyerek başlayın." />}
      />
    </div>
  );
}

/** Satır sonundaki düzenle/sil çifti — üç panelde ortak. */
function RowActions({
  label,
  onEdit,
  onDelete,
}: {
  label: string;
  onEdit: () => void;
  onDelete: () => void;
}): ReactElement {
  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        aria-label={`${label} kaydını düzenle`}
        onClick={onEdit}
        className="rounded-control text-ink-muted hover:bg-surface-sunken hover:text-ink inline-flex size-8 items-center justify-center"
      >
        <PencilLine className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        aria-label={`${label} kaydını sil`}
        onClick={onDelete}
        className="rounded-control text-ink-muted hover:bg-danger-weak hover:text-danger inline-flex size-8 items-center justify-center"
      >
        <Trash2 className="size-4" aria-hidden />
      </button>
    </div>
  );
}

/** Dialog + kaydet/sil mutasyonlarını tek yerde toplayan yardımcı durum. */
function useCatalogPanel<TEntity extends { id: string; name: string }, TValues extends FieldValues>(
  resource: Resource,
  form: UseFormReturn<TValues>,
  toValues: (entity: TEntity | null) => TValues,
): {
  editing: TEntity | null | undefined;
  pendingDelete: TEntity | null;
  save: ReturnType<typeof useSaveCatalogItem<TValues>>;
  remove: ReturnType<typeof useDeleteCatalogItem>;
  openForm: (entity: TEntity | null) => void;
  closeForm: () => void;
  setPendingDelete: (entity: TEntity | null) => void;
  confirmDelete: () => void;
} {
  const [editing, setEditing] = useState<TEntity | null | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<TEntity | null>(null);
  const save = useSaveCatalogItem<TValues>(resource);
  const remove = useDeleteCatalogItem(resource);
  const toast = useToast();

  return {
    editing,
    pendingDelete,
    save,
    remove,
    openForm: (entity) => {
      save.reset();
      form.reset(toValues(entity));
      setEditing(entity);
    },
    closeForm: () => {
      setEditing(undefined);
    },
    setPendingDelete,
    confirmDelete: () => {
      if (!pendingDelete) return;
      const name = pendingDelete.name;
      remove.mutate(pendingDelete.id, {
        onSuccess: () => {
          toast.success('Silindi', name);
          setPendingDelete(null);
        },
        onError: (error) => {
          toast.error('Silinemedi', apiErrorMessage(error));
        },
      });
    },
  };
}

function CategoryPanel(): ReactElement {
  const categories = useCategories();
  const form = useForm<CategoryValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: '', parentId: '' },
  });
  const panel = useCatalogPanel<Category, CategoryValues>('categories', form, (entity) => ({
    name: entity?.name ?? '',
    parentId: entity?.parentId ?? '',
  }));
  const parents = nameById(categories.data);
  const toast = useToast();

  const onSubmit = form.handleSubmit((values) => {
    panel.save.mutate(
      {
        ...(panel.editing ? { id: panel.editing.id } : {}),
        body: { name: values.name, ...(values.parentId ? { parentId: values.parentId } : {}) },
      },
      {
        onSuccess: () => {
          toast.success('Kategori kaydedildi', values.name);
          panel.closeForm();
        },
      },
    );
  });

  const columns: Column<Category>[] = [
    { key: 'name', header: 'Kategori', fixed: true, cell: (row) => row.name },
    {
      key: 'parent',
      header: 'Üst kategori',
      cell: (row) => (row.parentId ? (parents.get(row.parentId) ?? '—') : '—'),
    },
    {
      key: 'actions',
      header: 'İşlem',
      className: 'w-24 text-right',
      cell: (row) => (
        <RowActions
          label={row.name}
          onEdit={() => {
            panel.openForm(row);
          }}
          onDelete={() => {
            panel.setPendingDelete(row);
          }}
        />
      ),
    },
  ];

  return (
    <>
      <PanelShell
        addLabel="Yeni kategori"
        emptyTitle="Kategori yok"
        columns={columns}
        rows={categories.data ?? []}
        loading={categories.isPending}
        error={categories.isError ? apiErrorMessage(categories.error) : null}
        onRetry={() => {
          void categories.refetch();
        }}
        onAdd={() => {
          panel.openForm(null);
        }}
      />

      <Dialog
        open={panel.editing !== undefined}
        onClose={panel.closeForm}
        title={panel.editing ? 'Kategoriyi düzenle' : 'Yeni kategori'}
        footer={
          <>
            <Button variant="outline" onClick={panel.closeForm}>
              Vazgeç
            </Button>
            <Button
              loading={panel.save.isPending}
              onClick={() => {
                void onSubmit();
              }}
            >
              Kaydet
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {panel.save.isError ? <FormBanner message={apiErrorMessage(panel.save.error)} /> : null}
          <Field label="Kategori adı" required error={form.formState.errors.name?.message}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                autoFocus
                aria-describedby={describedBy}
                invalid={Boolean(form.formState.errors.name)}
                {...form.register('name')}
              />
            )}
          </Field>
          <Field label="Üst kategori" hint="Boş bırakılırsa ana kategori olur.">
            {({ id, describedBy }) => (
              <Select id={id} aria-describedby={describedBy} {...form.register('parentId')}>
                <option value="">Yok</option>
                {(categories.data ?? [])
                  .filter((category) => category.id !== panel.editing?.id)
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
        </div>
      </Dialog>

      <ConfirmDialog
        open={panel.pendingDelete !== null}
        title="Kategoriyi sil"
        description={`"${panel.pendingDelete?.name ?? ''}" silinecek. Bu kategorideki ürünler kategorisiz kalır.`}
        confirmLabel="Sil"
        destructive
        loading={panel.remove.isPending}
        onConfirm={panel.confirmDelete}
        onClose={() => {
          panel.setPendingDelete(null);
        }}
      />
    </>
  );
}

function BrandPanel(): ReactElement {
  const brands = useBrands();
  const form = useForm<BrandValues>({
    resolver: zodResolver(brandSchema),
    defaultValues: { name: '' },
  });
  const panel = useCatalogPanel<Brand, BrandValues>('brands', form, (entity) => ({
    name: entity?.name ?? '',
  }));
  const toast = useToast();

  const onSubmit = form.handleSubmit((values) => {
    panel.save.mutate(
      { ...(panel.editing ? { id: panel.editing.id } : {}), body: { name: values.name } },
      {
        onSuccess: () => {
          toast.success('Marka kaydedildi', values.name);
          panel.closeForm();
        },
      },
    );
  });

  const columns: Column<Brand>[] = [
    { key: 'name', header: 'Marka', fixed: true, cell: (row) => row.name },
    {
      key: 'actions',
      header: 'İşlem',
      className: 'w-24 text-right',
      cell: (row) => (
        <RowActions
          label={row.name}
          onEdit={() => {
            panel.openForm(row);
          }}
          onDelete={() => {
            panel.setPendingDelete(row);
          }}
        />
      ),
    },
  ];

  return (
    <>
      <PanelShell
        addLabel="Yeni marka"
        emptyTitle="Marka yok"
        columns={columns}
        rows={brands.data ?? []}
        loading={brands.isPending}
        error={brands.isError ? apiErrorMessage(brands.error) : null}
        onRetry={() => {
          void brands.refetch();
        }}
        onAdd={() => {
          panel.openForm(null);
        }}
      />

      <Dialog
        open={panel.editing !== undefined}
        onClose={panel.closeForm}
        title={panel.editing ? 'Markayı düzenle' : 'Yeni marka'}
        footer={
          <>
            <Button variant="outline" onClick={panel.closeForm}>
              Vazgeç
            </Button>
            <Button
              loading={panel.save.isPending}
              onClick={() => {
                void onSubmit();
              }}
            >
              Kaydet
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {panel.save.isError ? <FormBanner message={apiErrorMessage(panel.save.error)} /> : null}
          <Field label="Marka adı" required error={form.formState.errors.name?.message}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                autoFocus
                aria-describedby={describedBy}
                invalid={Boolean(form.formState.errors.name)}
                {...form.register('name')}
              />
            )}
          </Field>
        </div>
      </Dialog>

      <ConfirmDialog
        open={panel.pendingDelete !== null}
        title="Markayı sil"
        description={`"${panel.pendingDelete?.name ?? ''}" silinecek. Bu markadaki ürünler markasız kalır.`}
        confirmLabel="Sil"
        destructive
        loading={panel.remove.isPending}
        onConfirm={panel.confirmDelete}
        onClose={() => {
          panel.setPendingDelete(null);
        }}
      />
    </>
  );
}

function UnitPanel(): ReactElement {
  const units = useUnits();
  const form = useForm<UnitValues>({
    resolver: zodResolver(unitSchema),
    defaultValues: { name: '', abbreviation: '', allowsDecimal: false },
  });
  const panel = useCatalogPanel<Unit, UnitValues>('units', form, (entity) => ({
    name: entity?.name ?? '',
    abbreviation: entity?.abbreviation ?? '',
    allowsDecimal: entity?.allowsDecimal ?? false,
  }));
  const toast = useToast();

  const onSubmit = form.handleSubmit((values) => {
    panel.save.mutate(
      { ...(panel.editing ? { id: panel.editing.id } : {}), body: values },
      {
        onSuccess: () => {
          toast.success('Birim kaydedildi', values.name);
          panel.closeForm();
        },
      },
    );
  });

  const columns: Column<Unit>[] = [
    { key: 'name', header: 'Birim', fixed: true, cell: (row) => row.name },
    { key: 'abbreviation', header: 'Kısaltma', cell: (row) => row.abbreviation },
    {
      key: 'allowsDecimal',
      header: 'Ondalık',
      cell: (row) =>
        row.allowsDecimal ? <Badge tone="brand">Var</Badge> : <Badge tone="neutral">Yok</Badge>,
    },
    {
      key: 'actions',
      header: 'İşlem',
      className: 'w-24 text-right',
      cell: (row) => (
        <RowActions
          label={row.name}
          onEdit={() => {
            panel.openForm(row);
          }}
          onDelete={() => {
            panel.setPendingDelete(row);
          }}
        />
      ),
    },
  ];

  return (
    <>
      <PanelShell
        addLabel="Yeni birim"
        emptyTitle="Birim yok"
        columns={columns}
        rows={units.data ?? []}
        loading={units.isPending}
        error={units.isError ? apiErrorMessage(units.error) : null}
        onRetry={() => {
          void units.refetch();
        }}
        onAdd={() => {
          panel.openForm(null);
        }}
      />

      <Dialog
        open={panel.editing !== undefined}
        onClose={panel.closeForm}
        title={panel.editing ? 'Birimi düzenle' : 'Yeni birim'}
        footer={
          <>
            <Button variant="outline" onClick={panel.closeForm}>
              Vazgeç
            </Button>
            <Button
              loading={panel.save.isPending}
              onClick={() => {
                void onSubmit();
              }}
            >
              Kaydet
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {panel.save.isError ? <FormBanner message={apiErrorMessage(panel.save.error)} /> : null}
          <Field label="Birim adı" required error={form.formState.errors.name?.message}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                autoFocus
                aria-describedby={describedBy}
                invalid={Boolean(form.formState.errors.name)}
                {...form.register('name')}
              />
            )}
          </Field>
          <Field
            label="Kısaltma"
            required
            error={form.formState.errors.abbreviation?.message}
            hint="Listelerde miktarın yanında görünür (kg, ad, lt)."
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                invalid={Boolean(form.formState.errors.abbreviation)}
                {...form.register('abbreviation')}
              />
            )}
          </Field>
          <label className="flex items-start gap-2.5 text-sm">
            <Checkbox className="mt-0.5" {...form.register('allowsDecimal')} />
            <span>
              <span className="text-ink font-medium">Ondalık miktara izin ver</span>
              <span className="text-ink-muted block">
                Tartılı ürünler için gerekli (1,250 kg). Adetli birimlerde kapalı kalmalı.
              </span>
            </span>
          </label>
        </div>
      </Dialog>

      <ConfirmDialog
        open={panel.pendingDelete !== null}
        title="Birimi sil"
        description={`"${panel.pendingDelete?.name ?? ''}" silinecek. Bu birime bağlı ürün varsa silme reddedilir.`}
        confirmLabel="Sil"
        destructive
        loading={panel.remove.isPending}
        onConfirm={panel.confirmDelete}
        onClose={() => {
          panel.setPendingDelete(null);
        }}
      />
    </>
  );
}
