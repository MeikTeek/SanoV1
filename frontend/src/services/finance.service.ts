import { api } from './api';
import type {
  AccountType, FinanceOverview, FinanceReports, FinanceTransaction, ImportResult, ImportRow, TransactionInput,
} from '../types/finance';

const q = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const text = search.toString();
  return text ? `?${text}` : '';
};

export const financeApi = {
  overview: (month: string) => api.get<FinanceOverview>(`/finance${q({ month })}`),
  reports: (month: string) => api.get<FinanceReports>(`/finance/reports${q({ month })}`),

  createAccount: (input: { name: string; type: AccountType; offBudget: boolean; balance: number; date: string }) =>
    api.post('/finance/accounts', input),
  updateAccount: (id: string, input: { name?: string; type?: AccountType; closed?: boolean }) =>
    api.patch(`/finance/accounts/${id}`, input),
  deleteAccount: (id: string) => api.delete(`/finance/accounts/${id}`),

  createGroup: (name: string, isIncome = false) => api.post('/finance/groups', { name, isIncome }),
  updateGroup: (id: string, input: { name?: string; hidden?: boolean }) => api.patch(`/finance/groups/${id}`, input),
  deleteGroup: (id: string) => api.delete(`/finance/groups/${id}`),
  createCategory: (groupId: string, name: string) => api.post('/finance/categories', { groupId, name }),
  updateCategory: (id: string, input: { name?: string; hidden?: boolean; groupId?: string }) =>
    api.patch(`/finance/categories/${id}`, input),
  deleteCategory: (id: string, transferTo?: string) => api.delete(`/finance/categories/${id}${q({ transferTo })}`),

  setBudget: (input: { month: string; categoryId: string; budgeted?: number; carryover?: boolean }) =>
    api.put('/finance/budgets', input),
  copyLastMonth: (month: string) => api.post<{ copied: number }>('/finance/budgets/copy-last-month', { month }),
  coverOverspending: (month: string) => api.post<{ covered: number }>('/finance/budgets/cover-overspending', { month }),

  transactions: (filters: { accountId?: string; month?: string; search?: string; categoryId?: string; uncategorized?: boolean }) =>
    api.get<FinanceTransaction[]>(`/finance/transactions${q({ ...filters, uncategorized: filters.uncategorized ? '1' : undefined })}`),
  createTransaction: (input: TransactionInput) => api.post('/finance/transactions', input),
  updateTransaction: (id: string, input: TransactionInput) => api.patch(`/finance/transactions/${id}`, input),
  setCleared: (id: string, cleared: boolean) => api.patch(`/finance/transactions/${id}/cleared`, { cleared }),
  deleteTransaction: (id: string) => api.delete(`/finance/transactions/${id}`),

  importRows: (accountId: string, rows: ImportRow[], commit: boolean) =>
    api.post<ImportResult>('/finance/import', { accountId, rows, commit }),
};
