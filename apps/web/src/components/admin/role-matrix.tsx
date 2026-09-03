'use client';

import { Lock, Plus, Shield, Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';

import { PERMISSIONS } from '@stokk/types';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Checkbox,
  Dialog,
  EmptyState,
  Field,
  formatCount,
  Input,
  Spinner,
  Textarea,
  useToast,
} from '@stokk/ui';

import { AdminTabs } from './admin-tabs';
import { useDeleteRole, usePermissionCatalog, useRoles, useSaveRole } from '../../hooks/use-admin';
import { apiErrorMessage } from '../../lib/api';
import type { PermissionGroup, Role } from '../../lib/api-types';
import { usePermission } from '../../lib/permissions';
import { ConfirmDialog } from '../common/confirm-dialog';
import { PageHeader } from '../common/page-header';
import { FormBanner } from '../form-banner';

/** İzin kodlarının kaynak adları — matris başlıkları Türkçe okunur olsun. */
const RESOURCE_LABELS: Record<string, string> = {
  product: 'Ürün',
  catalog: 'Katalog',
  stock: 'Stok',
  sale: 'Satış',
  'cash-session': 'Vardiya',
  'cash-movement': 'Kasa hareketi',
  register: 'Kasa',
  contact: 'Cari',
  'contact-transaction': 'Cari hareketi',
  purchase: 'Alış',
  expense: 'Gider',
  income: 'Gelir',
  report: 'Rapor',
  einvoice: 'e-Fatura',
  user: 'Kullanıcı',
  role: 'Rol',
  settings: 'Ayarlar',
  'audit-log': 'Denetim kaydı',
  subscription: 'Abonelik',
};

function resourceLabel(resource: string): string {
  return RESOURCE_LABELS[resource] ?? resource;
}

/** Kaldırılması kilitlenmeye yol açabilecek izin. */
const ROLE_MANAGE_CODE: string = PERMISSIONS.ROLE_MANAGE;

/**
 * Rol yönetimi ve izin matrisi.
 *
 * Sistem rolleri (Patron/Yönetici/Kasiyer) salt okunurdur: adı değiştirilemez,
 * silinemez. Matris kaynak bazında gruplu — 45 izni düz liste hâlinde göstermek
 * yerine "Ürün", "Satış" gibi başlıklar altında toplanır, grup başlığından toplu
 * seçim yapılabilir.
 *
 * Ekranda gizlemek TEK BAŞINA güvenlik değildir: sunucu her uçta `@Permissions()`
 * ile aynı izni ayrıca zorlar.
 */
export function RoleMatrix(): ReactElement {
  const roles = useRoles();
  const catalog = usePermissionCatalog();
  const saveRole = useSaveRole();
  const deleteRole = useDeleteRole();
  const toast = useToast();
  const canManage = usePermission(PERMISSIONS.ROLE_MANAGE);

  const [editing, setEditing] = useState<Role | null | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<Role | null>(null);

  if (!canManage) {
    return (
      <EmptyState
        icon={Shield}
        title="Rol yönetimi için yetkiniz yok"
        description="Rol ve izin düzenlemesi yalnız yetkili hesaplarda açıktır."
      />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Roller ve izinler"
        description="Her rolün hangi işlemi yapabileceği burada belirlenir."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
            }}
          >
            <Plus aria-hidden />
            Yeni rol
          </Button>
        }
      />
      <AdminTabs />

      {roles.isPending || catalog.isPending ? (
        <div className="flex h-40 items-center justify-center">
          <Spinner label="Roller yükleniyor" />
        </div>
      ) : roles.isError ? (
        <FormBanner message={apiErrorMessage(roles.error)} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {(roles.data ?? []).map((role) => (
            <Card key={role.id}>
              <CardHeader className="flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {role.name}
                    {role.isSystem ? (
                      <Badge tone="neutral">
                        <Lock aria-hidden />
                        Sistem rolü
                      </Badge>
                    ) : null}
                  </CardTitle>
                  <p className="text-ink-muted text-sm">
                    {role.description ?? 'Açıklama yok'} · {formatCount(role._count.users)}{' '}
                    kullanıcı
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditing(role);
                    }}
                  >
                    İzinleri düzenle
                  </Button>
                  {role.isSystem ? null : (
                    <button
                      type="button"
                      aria-label={`${role.name} rolünü sil`}
                      onClick={() => {
                        setPendingDelete(role);
                      }}
                      className="rounded-control text-ink-muted hover:bg-danger-weak hover:text-danger inline-flex size-8 items-center justify-center"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  )}
                </div>
              </CardHeader>
              <CardBody>
                <p className="text-ink-muted text-sm">
                  {formatCount(role.permissions.length)} izin tanımlı
                </p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <RoleDialog
        role={editing}
        groups={catalog.data ?? []}
        loading={saveRole.isPending}
        error={saveRole.error}
        onClose={() => {
          setEditing(undefined);
        }}
        onSubmit={(id, body) => {
          saveRole.mutate(
            { ...(id ? { id } : {}), body },
            {
              onSuccess: () => {
                toast.success('Rol kaydedildi', body.name);
                setEditing(undefined);
              },
            },
          );
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Rolü sil"
        description={`"${pendingDelete?.name ?? ''}" silinecek. Bu role atanmış kullanıcı varsa silme reddedilir.`}
        confirmLabel="Sil"
        destructive
        loading={deleteRole.isPending}
        onConfirm={() => {
          if (!pendingDelete) return;
          deleteRole.mutate(pendingDelete.id, {
            onSuccess: () => {
              toast.success('Rol silindi');
              setPendingDelete(null);
            },
            onError: (error) => {
              toast.error('Rol silinemedi', apiErrorMessage(error));
            },
          });
        }}
        onClose={() => {
          setPendingDelete(null);
        }}
      />
    </div>
  );
}

function RoleDialog({
  role,
  groups,
  loading,
  error,
  onClose,
  onSubmit,
}: {
  /** `null` = yeni rol, `undefined` = kapalı. */
  role: Role | null | undefined;
  groups: PermissionGroup[];
  loading: boolean;
  error: Error | null;
  onClose: () => void;
  onSubmit: (
    id: string | undefined,
    body: { name: string; description?: string; permissions: string[] },
  ) => void;
}): ReactElement {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const open = role !== undefined;

  // Dialog açıldığında/başka role geçildiğinde form sıfırlanır — render sırasında,
  // effect'te değil (effect'te setState zincirleme render üretir).
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = open ? (role?.id ?? 'new') : null;
  if (key !== lastKey) {
    setLastKey(key);
    setName(role?.name ?? '');
    setDescription(role?.description ?? '');
    setSelected(new Set((role?.permissions ?? []).map((entry) => entry.permission.code)));
  }

  const total = useMemo(
    () => groups.reduce((sum, group) => sum + group.permissions.length, 0),
    [groups],
  );

  function toggle(code: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function toggleGroup(group: PermissionGroup, allSelected: boolean): void {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const permission of group.permissions) {
        if (allSelected) next.delete(permission.code);
        else next.add(permission.code);
      }
      return next;
    });
  }

  const isSystem = role?.isSystem ?? false;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={role ? `${role.name} — izinler` : 'Yeni rol'}
      description={
        isSystem
          ? 'Sistem rolünün adı değiştirilemez; izinleri düzenlenebilir.'
          : `${formatCount(selected.size)} / ${formatCount(total)} izin seçili`
      }
      closeDisabled={loading}
      className="w-[min(52rem,calc(100vw-2rem))]"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Vazgeç
          </Button>
          <Button
            loading={loading}
            disabled={name.trim().length < 2 || selected.size === 0}
            onClick={() => {
              onSubmit(role?.id, {
                name: name.trim(),
                permissions: [...selected],
                ...(description.trim() ? { description: description.trim() } : {}),
              });
            }}
          >
            Kaydet
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <FormBanner message={apiErrorMessage(error)} /> : null}

        {/*
          Kendini kilitleme uyarısı: rol yönetme izni kaldırılmış bir rolle
          kaydetmek, bu role sahip son kullanıcının rol ekranına bir daha
          girememesine yol açabilir. Sunucu da son yetkiliyi korur (LAST_ROLE_ADMIN),
          ama kullanıcı bunu kaydetmeden ÖNCE görmeli.
        */}
        {role && !selected.has(ROLE_MANAGE_CODE) ? (
          <div
            role="alert"
            className="rounded-control border-warning/30 bg-warning-weak text-warning border px-3 py-2 text-sm"
          >
            Bu rolden <strong>rol yönetme</strong> izni kaldırılıyor. Bu role sahip kullanıcılar rol
            ve izin ekranına bir daha giremez.
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Rol adı" required>
            {({ id }) => (
              <Input
                id={id}
                value={name}
                disabled={isSystem}
                onChange={(e) => {
                  setName(e.target.value);
                }}
              />
            )}
          </Field>
          <Field label="Açıklama">
            {({ id }) => (
              <Textarea
                id={id}
                rows={1}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                }}
              />
            )}
          </Field>
        </div>

        <div className="border-border rounded-control max-h-[26rem] space-y-4 overflow-y-auto border p-3">
          {groups.map((group) => {
            const allSelected = group.permissions.every((p) => selected.has(p.code));
            const someSelected = group.permissions.some((p) => selected.has(p.code));
            return (
              <fieldset key={group.resource} className="space-y-1.5">
                <legend className="sr-only">{resourceLabel(group.resource)} izinleri</legend>
                <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
                  <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected && !allSelected}
                    onChange={() => {
                      toggleGroup(group, allSelected);
                    }}
                  />
                  {resourceLabel(group.resource)}
                </label>
                <ul className="ml-6 grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {group.permissions.map((permission) => (
                    <li key={permission.code}>
                      <label className="hover:bg-surface-sunken rounded-control flex cursor-pointer items-center gap-2.5 px-2 py-1 text-sm">
                        <Checkbox
                          checked={selected.has(permission.code)}
                          onChange={() => {
                            toggle(permission.code);
                          }}
                        />
                        <span>
                          {permission.description ?? permission.action}
                          <span className="text-ink-subtle ml-2 text-xs">{permission.code}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            );
          })}
        </div>
      </div>
    </Dialog>
  );
}
