/** Todos os valores monetários estão em centavos inteiros. */

export type AccountType = 'CHECKING' | 'SAVINGS' | 'CREDIT' | 'CASH' | 'INVESTMENT' | 'OTHER';

export interface FinanceAccount {
  id: string;
  name: string;
  type: AccountType;
  offBudget: boolean;
  closed: boolean;
  balance: number;
  clearedBalance: number;
}

export interface FinanceCategory {
  id: string;
  name: string;
  hidden: boolean;
}

export interface FinanceGroup {
  id: string;
  name: string;
  isIncome: boolean;
  hidden: boolean;
  categories: FinanceCategory[];
}

export interface FinancePayee {
  id: string;
  name: string;
  lastCategoryId: string | null;
}

export interface CategoryMonth {
  budgeted: number;
  spent: number;
  balance: number;
  carryover: boolean;
}

export interface BudgetMonth {
  month: string;
  income: number;
  fromLastMonth: number;
  lastMonthOverspent: number;
  totalBudgeted: number;
  totalSpent: number;
  totalBalance: number;
  toBudget: number;
  categories: Record<string, CategoryMonth>;
}

export interface FinanceOverview {
  month: string;
  accounts: FinanceAccount[];
  groups: FinanceGroup[];
  payees: FinancePayee[];
  budget: BudgetMonth;
  uncategorized: number;
}

export interface FinanceTransaction {
  id: string;
  accountId: string;
  accountName: string;
  date: string;
  amount: number;
  payee: string | null;
  categoryId: string | null;
  notes: string | null;
  cleared: boolean;
  transferAccountId: string | null;
  transferAccountName: string | null;
}

export interface TransactionInput {
  accountId: string;
  date: string;
  amount: number;
  payee?: string | null;
  categoryId?: string | null;
  notes?: string | null;
  cleared?: boolean;
  transferAccountId?: string | null;
}

export interface ImportRow {
  line: number;
  date: string;
  amount: string;
  payee: string;
  notes?: string;
  category?: string;
}

export interface ImportResultRow {
  line: number;
  date: string;
  amount: number;
  payee: string;
  notes: string | null;
  categoryId: string | null;
  status: 'ok' | 'duplicate' | 'error';
  message: string | null;
}

export interface ImportResult {
  imported: number;
  rows: ImportResultRow[];
}

export interface FinanceReports {
  month: string;
  cashflow: { month: string; income: number; spending: number; net: number }[];
  byCategory: { categoryId: string; name: string; group: string; spent: number }[];
  netWorth: { month: string; value: number }[];
}
