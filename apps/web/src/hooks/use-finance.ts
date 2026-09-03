'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api';
import type { Expense, ExpenseCategory, Income, Paginated, PaymentMethod } from '../lib/api-types';
import { listParamsToApiQuery, type ListParams } from '../lib/list-params';

export function useExpenses(params: ListParams): UseQueryResult<Paginated<Expense>> {
  const query = listParamsToApiQuery(params);
  return useQuery({
    queryKey: ['expenses', query],
    queryFn: () => apiGet<Paginated<Expense>>('/expenses', { params: query }),
    placeholderData: (previous) => previous,
  });
}

export function useIncomes(params: ListParams): UseQueryResult<Paginated<Income>> {
  const query = listParamsToApiQuery(params);
  return useQuery({
    queryKey: ['incomes', query],
    queryFn: () => apiGet<Paginated<Income>>('/incomes', { params: query }),
    placeholderData: (previous) => previous,
  });
}

export function useExpenseCategories(enabled = true): UseQueryResult<ExpenseCategory[]> {
  return useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => apiGet<ExpenseCategory[]>('/expense-categories'),
    staleTime: 5 * 60_000,
    enabled,
  });
}

export interface ExpensePayload {
  amount: string;
  paymentMethod: PaymentMethod;
  description: string;
  expenseDate: string;
  categoryId?: string;
  cashSessionId?: string;
  documentNo?: string;
}

export interface IncomePayload {
  amount: string;
  paymentMethod: PaymentMethod;
  description: string;
  incomeDate: string;
  cashSessionId?: string;
  documentNo?: string;
}

/** Nakit gider/gelir açık vardiyaya bağlanırsa kasa hareketi de üretir — vardiya cache'i tazelenir. */
function invalidateFinance(queryClient: ReturnType<typeof useQueryClient>, key: string): void {
  void queryClient.invalidateQueries({ queryKey: [key] });
  void queryClient.invalidateQueries({ queryKey: ['cash-sessions'] });
}

export function useCreateExpense(): UseMutationResult<unknown, Error, ExpensePayload> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ExpensePayload) => apiPost<unknown>('/expenses', payload),
    onSuccess: () => {
      invalidateFinance(queryClient, 'expenses');
    },
  });
}

export function useCreateIncome(): UseMutationResult<unknown, Error, IncomePayload> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: IncomePayload) => apiPost<unknown>('/incomes', payload),
    onSuccess: () => {
      invalidateFinance(queryClient, 'incomes');
    },
  });
}

export interface UpdateExpenseArgs {
  id: string;
  /** `null` gönderilen alan bağlantıyı kaldırır (kategori, belge no). */
  body: {
    amount?: string;
    paymentMethod?: PaymentMethod;
    description?: string;
    expenseDate?: string;
    categoryId?: string | null;
    documentNo?: string | null;
  };
}

export function useUpdateExpense(): UseMutationResult<Expense, Error, UpdateExpenseArgs> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: UpdateExpenseArgs) => apiPatch<Expense>(`/expenses/${id}`, body),
    onSuccess: () => {
      invalidateFinance(queryClient, 'expenses');
    },
  });
}

export function useDeleteExpense(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/expenses/${id}`),
    onSuccess: () => {
      invalidateFinance(queryClient, 'expenses');
    },
  });
}

export interface UpdateIncomeArgs {
  id: string;
  body: {
    amount?: string;
    paymentMethod?: PaymentMethod;
    description?: string;
    incomeDate?: string;
    documentNo?: string | null;
  };
}

export function useUpdateIncome(): UseMutationResult<Income, Error, UpdateIncomeArgs> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: UpdateIncomeArgs) => apiPatch<Income>(`/incomes/${id}`, body),
    onSuccess: () => {
      invalidateFinance(queryClient, 'incomes');
    },
  });
}

export function useDeleteIncome(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/incomes/${id}`),
    onSuccess: () => {
      invalidateFinance(queryClient, 'incomes');
    },
  });
}

export interface UpdateCategoryArgs {
  id: string;
  name: string;
}

export function useUpdateExpenseCategory(): UseMutationResult<
  ExpenseCategory,
  Error,
  UpdateCategoryArgs
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: UpdateCategoryArgs) =>
      apiPatch<ExpenseCategory>(`/expense-categories/${id}`, { name }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      // Kategori adı gider listesinde de görünüyor.
      void queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
  });
}

export function useCreateExpenseCategory(): UseMutationResult<
  ExpenseCategory,
  Error,
  { name: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string }) =>
      apiPost<ExpenseCategory>('/expense-categories', payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
    },
  });
}

export function useDeleteExpenseCategory(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/expense-categories/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
    },
  });
}
