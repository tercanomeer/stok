'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api';
import type {
  AuditLogRow,
  EInvoiceRow,
  ManagedUser,
  Paginated,
  PermissionGroup,
  Role,
  SettingsResponse,
} from '../lib/api-types';
import { listParamsToApiQuery, type ListParams } from '../lib/list-params';

// --- e-Fatura ---

export function useEInvoices(params: ListParams): UseQueryResult<Paginated<EInvoiceRow>> {
  const query = listParamsToApiQuery(params);
  return useQuery({
    queryKey: ['e-invoices', query],
    queryFn: () => apiGet<Paginated<EInvoiceRow>>('/e-invoices', { params: query }),
    placeholderData: (previous) => previous,
  });
}

/** Gönder / durum sorgula / iptal — üçü de kaydı değiştirir, liste tazelenir. */
export function useEInvoiceAction(
  action: 'send' | 'refresh' | 'cancel',
): UseMutationResult<EInvoiceRow, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<EInvoiceRow>(`/e-invoices/${id}/${action}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['e-invoices'] });
    },
  });
}

// --- Kullanıcı ---

export function useUsers(): UseQueryResult<ManagedUser[]> {
  return useQuery({ queryKey: ['users'], queryFn: () => apiGet<ManagedUser[]>('/users') });
}

export interface CreateUserPayload {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  roleIds: string[];
}

export function useCreateUser(): UseMutationResult<ManagedUser, Error, CreateUserPayload> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateUserPayload) => apiPost<ManagedUser>('/users', payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export interface UpdateUserPayload {
  id: string;
  body: { fullName?: string; phone?: string; status?: 'ACTIVE' | 'INACTIVE'; roleIds?: string[] };
}

export function useUpdateUser(): UseMutationResult<ManagedUser, Error, UpdateUserPayload> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: UpdateUserPayload) => apiPatch<ManagedUser>(`/users/${id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

// --- Rol ---

export function useRoles(enabled = true): UseQueryResult<Role[]> {
  return useQuery({ queryKey: ['roles'], queryFn: () => apiGet<Role[]>('/roles'), enabled });
}

export function usePermissionCatalog(enabled = true): UseQueryResult<PermissionGroup[]> {
  return useQuery({
    queryKey: ['roles', 'permissions'],
    queryFn: () => apiGet<PermissionGroup[]>('/roles/permissions'),
    staleTime: 30 * 60_000,
    enabled,
  });
}

export interface SaveRolePayload {
  id?: string;
  body: { name?: string; description?: string; permissions: string[] };
}

export function useSaveRole(): UseMutationResult<Role, Error, SaveRolePayload> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: SaveRolePayload) =>
      id ? apiPatch<Role>(`/roles/${id}`, body) : apiPost<Role>('/roles', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['roles'] });
      // İzin değişikliği kullanıcının yetkisini de değiştirir.
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useDeleteRole(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/roles/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
  });
}

// --- Ayarlar ---

export function useSettings(enabled = true): UseQueryResult<SettingsResponse> {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => apiGet<SettingsResponse>('/settings'),
    enabled,
  });
}

/**
 * Ayar güncelleme. Kimlik bilgisi alanları YALNIZ yeniden yazıldığında gönderilir;
 * gönderilmeyen alan sunucuda korunur (maskeyi geri gönderip gerçek parolayı ezmeyiz).
 */
export function useUpdateSettings(): UseMutationResult<
  SettingsResponse,
  Error,
  Record<string, unknown>
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiPatch<SettingsResponse>('/settings', payload),
    onSuccess: (data) => {
      queryClient.setQueryData(['settings'], data);
    },
  });
}

// --- Denetim kaydı ---

export function useAuditLogs(params: ListParams): UseQueryResult<Paginated<AuditLogRow>> {
  const query = listParamsToApiQuery(params);
  return useQuery({
    queryKey: ['audit-logs', query],
    queryFn: () => apiGet<Paginated<AuditLogRow>>('/audit-logs', { params: query }),
    placeholderData: (previous) => previous,
  });
}
