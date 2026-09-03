'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { PencilLine, UserPlus, Users } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { PERMISSIONS } from '@stokk/types';
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  EmptyState,
  Field,
  formatDateTime,
  Input,
  Select,
  useToast,
} from '@stokk/ui';

import { AdminTabs } from './admin-tabs';
import { useCreateUser, useRoles, useUpdateUser, useUsers } from '../../hooks/use-admin';
import { userSchema, type UserValues } from '../../lib/admin-schemas';
import { apiErrorMessage } from '../../lib/api';
import type { ManagedUser } from '../../lib/api-types';
import { usePermission } from '../../lib/permissions';
import { Can } from '../can';
import { DataTable, type Column } from '../common/data-table';
import { PageHeader } from '../common/page-header';
import { FormBanner } from '../form-banner';

/** Kullanıcı yönetimi: oluştur, rol ata, aktif/pasif. Silme yok — pasife alınır. */
export function UserList(): ReactElement {
  const users = useUsers();
  const roles = useRoles();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const toast = useToast();
  const canManage = usePermission(PERMISSIONS.USER_MANAGE);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);

  const columns = useMemo<Column<ManagedUser>[]>(() => {
    const base: Column<ManagedUser>[] = [
      {
        key: 'fullName',
        header: 'Kullanıcı',
        fixed: true,
        cell: (user) => (
          <div className="flex flex-col">
            <span className="text-ink font-medium">{user.fullName}</span>
            <span className="text-ink-subtle text-xs">{user.email}</span>
          </div>
        ),
      },
      {
        key: 'roles',
        header: 'Roller',
        cell: (user) => (
          <div className="flex flex-wrap gap-1">
            {user.roles.map((entry) => (
              <Badge key={entry.role.id} tone="neutral">
                {entry.role.name}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        key: 'phone',
        header: 'Telefon',
        cell: (user) => <span className="tabular">{user.phone ?? '—'}</span>,
      },
      {
        key: 'lastLoginAt',
        header: 'Son giriş',
        cell: (user) =>
          user.lastLoginAt ? (
            <span className="tabular">{formatDateTime(user.lastLoginAt)}</span>
          ) : (
            <span className="text-ink-subtle">Hiç girmedi</span>
          ),
      },
      {
        key: 'status',
        header: 'Durum',
        cell: (user) => (
          <Badge tone={user.status === 'ACTIVE' ? 'success' : 'neutral'}>
            {user.status === 'ACTIVE' ? 'Aktif' : 'Pasif'}
          </Badge>
        ),
      },
    ];

    if (!canManage) return base;

    return [
      ...base,
      {
        key: 'actions',
        header: 'İşlem',
        className: 'w-20',
        cell: (user) => (
          <button
            type="button"
            aria-label={`${user.fullName} kullanıcısını düzenle`}
            onClick={() => {
              setEditing(user);
            }}
            className="rounded-control text-ink-muted hover:bg-surface-sunken hover:text-ink inline-flex size-8 items-center justify-center"
          >
            <PencilLine className="size-4" aria-hidden />
          </button>
        ),
      },
    ];
  }, [canManage]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Kullanıcılar"
        description="Hesaplar, rol atamaları ve erişim durumu."
        actions={
          <Can permission={PERMISSIONS.USER_MANAGE}>
            <Button
              onClick={() => {
                setCreating(true);
              }}
            >
              <UserPlus aria-hidden />
              Yeni kullanıcı
            </Button>
          </Can>
        }
      />
      <AdminTabs />

      <DataTable
        columns={columns}
        rows={users.data ?? []}
        rowKey={(user) => user.id}
        loading={users.isPending}
        error={users.isError ? apiErrorMessage(users.error) : null}
        onRetry={() => {
          void users.refetch();
        }}
        empty={<EmptyState icon={Users} title="Kullanıcı yok" />}
      />

      <CreateUserDialog
        open={creating}
        roles={(roles.data ?? []).map((role) => ({ id: role.id, name: role.name }))}
        loading={createUser.isPending}
        error={createUser.error}
        onClose={() => {
          setCreating(false);
        }}
        onSubmit={(values) => {
          createUser.mutate(
            {
              email: values.email,
              password: values.password,
              fullName: values.fullName,
              roleIds: values.roleIds,
              ...(values.phone ? { phone: values.phone } : {}),
            },
            {
              onSuccess: () => {
                toast.success('Kullanıcı oluşturuldu', values.fullName);
                setCreating(false);
              },
            },
          );
        }}
      />

      <EditUserDialog
        user={editing}
        roles={(roles.data ?? []).map((role) => ({ id: role.id, name: role.name }))}
        loading={updateUser.isPending}
        error={updateUser.error}
        onClose={() => {
          setEditing(null);
        }}
        onSubmit={(id, body) => {
          updateUser.mutate(
            { id, body },
            {
              onSuccess: () => {
                toast.success('Kullanıcı güncellendi');
                setEditing(null);
              },
            },
          );
        }}
      />
    </div>
  );
}

interface RoleOption {
  id: string;
  name: string;
}

function RolePicker({
  roles,
  selected,
  onToggle,
}: {
  roles: RoleOption[];
  selected: string[];
  onToggle: (id: string) => void;
}): ReactElement {
  return (
    <ul className="border-border rounded-control divide-border divide-y border">
      {roles.map((role) => (
        <li key={role.id}>
          <label className="hover:bg-surface-sunken flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm">
            <Checkbox
              checked={selected.includes(role.id)}
              onChange={() => {
                onToggle(role.id);
              }}
            />
            {role.name}
          </label>
        </li>
      ))}
    </ul>
  );
}

function CreateUserDialog({
  open,
  roles,
  loading,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  roles: RoleOption[];
  loading: boolean;
  error: Error | null;
  onClose: () => void;
  onSubmit: (values: UserValues) => void;
}): ReactElement {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm<UserValues>({
    resolver: zodResolver(userSchema),
    defaultValues: { fullName: '', email: '', phone: '', password: '', roleIds: [] },
  });

  // Dialog her açılışta temiz açılır — render sırasında, effect'te değil.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) reset({ fullName: '', email: '', phone: '', password: '', roleIds: [] });
  }

  const roleIds = useWatch({ control, name: 'roleIds' });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Yeni kullanıcı"
      closeDisabled={loading}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Vazgeç
          </Button>
          <Button
            loading={loading}
            onClick={() => {
              void handleSubmit(onSubmit)();
            }}
          >
            Oluştur
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <FormBanner message={apiErrorMessage(error)} /> : null}

        <Field label="Ad soyad" required error={errors.fullName?.message}>
          {({ id, describedBy }) => (
            <Input
              id={id}
              autoFocus
              aria-describedby={describedBy}
              invalid={Boolean(errors.fullName)}
              {...register('fullName')}
            />
          )}
        </Field>

        <Field label="E-posta" required error={errors.email?.message}>
          {({ id, describedBy }) => (
            <Input
              id={id}
              type="email"
              autoComplete="off"
              aria-describedby={describedBy}
              invalid={Boolean(errors.email)}
              {...register('email')}
            />
          )}
        </Field>

        <Field label="Telefon" error={errors.phone?.message}>
          {({ id, describedBy }) => (
            <Input id={id} type="tel" aria-describedby={describedBy} {...register('phone')} />
          )}
        </Field>

        <Field
          label="Geçici şifre"
          required
          error={errors.password?.message}
          hint="Kullanıcı ilk girişte kendi şifresiyle değiştirebilir."
        >
          {({ id, describedBy }) => (
            <Input
              id={id}
              type="password"
              autoComplete="new-password"
              aria-describedby={describedBy}
              invalid={Boolean(errors.password)}
              {...register('password')}
            />
          )}
        </Field>

        <Field label="Roller" required error={errors.roleIds?.message}>
          {() => (
            <RolePicker
              roles={roles}
              selected={roleIds}
              onToggle={(id) => {
                setValue(
                  'roleIds',
                  roleIds.includes(id) ? roleIds.filter((r) => r !== id) : [...roleIds, id],
                  { shouldValidate: true },
                );
              }}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}

function EditUserDialog({
  user,
  roles,
  loading,
  error,
  onClose,
  onSubmit,
}: {
  user: ManagedUser | null;
  roles: RoleOption[];
  loading: boolean;
  error: Error | null;
  onClose: () => void;
  onSubmit: (
    id: string,
    body: { fullName: string; phone?: string; status: 'ACTIVE' | 'INACTIVE'; roleIds?: string[] },
  ) => void;
}): ReactElement {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [roleIds, setRoleIds] = useState<string[]>([]);

  // Başka kullanıcıya geçilince form o kullanıcıyla dolar — render sırasında.
  const [lastUserId, setLastUserId] = useState<string | null>(null);
  const userId = user?.id ?? null;
  if (userId !== lastUserId) {
    setLastUserId(userId);
    setFullName(user?.fullName ?? '');
    setPhone(user?.phone ?? '');
    setStatus(user?.status ?? 'ACTIVE');
    setRoleIds((user?.roles ?? []).map((entry) => entry.role.id));
  }

  return (
    <Dialog
      open={user !== null}
      onClose={onClose}
      title="Kullanıcıyı düzenle"
      description={user?.email}
      closeDisabled={loading}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Vazgeç
          </Button>
          <Button
            loading={loading}
            disabled={fullName.trim().length < 2 || roleIds.length === 0}
            onClick={() => {
              if (!user) return;
              // Roller DEĞİŞMEDİYSE gönderilmez: sunucu "kendi rollerinizi
              // değiştiremezsiniz" kuralını rol alanı geldiğinde uyguluyor;
              // koşulsuz göndermek kullanıcının kendi adını bile değiştirmesini
              // engelliyordu.
              const original = user.roles.map((entry) => entry.role.id);
              const rolesChanged =
                original.length !== roleIds.length || original.some((id) => !roleIds.includes(id));
              onSubmit(user.id, {
                fullName: fullName.trim(),
                status,
                ...(rolesChanged ? { roleIds } : {}),
                ...(phone.trim() ? { phone: phone.trim() } : {}),
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

        <Field label="Ad soyad" required>
          {({ id }) => (
            <Input
              id={id}
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
              }}
            />
          )}
        </Field>

        <Field label="Telefon">
          {({ id }) => (
            <Input
              id={id}
              type="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
              }}
            />
          )}
        </Field>

        <Field
          label="Durum"
          required
          hint="Pasif kullanıcı giriş yapamaz; mevcut oturumu de yenilenemez."
        >
          {({ id }) => (
            <Select
              id={id}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as 'ACTIVE' | 'INACTIVE');
              }}
            >
              <option value="ACTIVE">Aktif</option>
              <option value="INACTIVE">Pasif</option>
            </Select>
          )}
        </Field>

        <Field label="Roller" required>
          {() => (
            <RolePicker
              roles={roles}
              selected={roleIds}
              onToggle={(id) => {
                setRoleIds((prev) =>
                  prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id],
                );
              }}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}
