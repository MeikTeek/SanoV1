import { useEffect, useState } from 'react';
import AppShell from '../../components/layout/AppShell';
import { api } from '../../services/api';

interface Account {
  id: string;
  name: string;
  balance: number;
}

interface Transaction {
  id: string;
  accountId: string;
  description: string;
  amount: number;
  date: string;
  category: string;
}

interface Budget {
  id: string;
  month: string;
  category: string;
  amount: number;
  allocated: number;
  spent: number;
  available: number;
  carryover: boolean;
}

interface CategoryGroup {
  id: string;
  name: string;
  categories: string[];
}

interface FinanceData {
  accounts: Account[];
  transactions: Transaction[];
  categories: string[];
  categoryGroups: CategoryGroup[];
  budgets: Budget[];
  summary: { income: number; expenses: number; balance: number };
}

interface Reports {
  byCategory: { category: string; spent: number; allocated: number; available: number }[];
  months: { month: string; income: number; expenses: number; balance: number }[];
}

interface ImportRow {
  accountId: string;
  description: string;
  amount: number;
  date: string;
  category: string;
  line: number;
}

interface ImportPreview {
  imported: number;
  preview: ImportRow[];
  duplicates: number[];
  errors: { line: number; message: string }[];
}

const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

function parseCsv(text: string, accountId: string): ImportRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (const char of text.replace(/^\uFEFF/, '')) {
    if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r') continue;
      row.push(cell.trim()); cell = '';
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  const headers = rows.shift()?.map((header) => header.toLowerCase()) ?? [];
  const dateIndex = headers.indexOf('date');
  const descriptionIndex = headers.indexOf('description');
  const amountIndex = headers.indexOf('amount');
  const categoryIndex = headers.indexOf('category');
  if ([dateIndex, descriptionIndex, amountIndex, categoryIndex].some((index) => index < 0)) {
    throw new Error('CSV precisa das colunas date, description, amount e category.');
  }
  return rows.map((values, index) => ({
    accountId,
    date: values[dateIndex],
    description: values[descriptionIndex],
    amount: Number(values[amountIndex].replace(',', '.')),
    category: values[categoryIndex],
    line: index + 2,
  }));
}

export default function FinancePage() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [error, setError] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountBalance, setAccountBalance] = useState('0');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [accountId, setAccountId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [newCategory, setNewCategory] = useState('');
  const [budgetCategory, setBudgetCategory] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [carryover, setCarryover] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [transferTo, setTransferTo] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [reports, setReports] = useState<Reports | null>(null);
  const [showReports, setShowReports] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importing, setImporting] = useState(false);

  const load = () => Promise.all([
    api.get<FinanceData>(`/finance?month=${encodeURIComponent(month)}`).then(setData),
    api.get<Reports>(`/finance/reports?month=${encodeURIComponent(month)}`).then(setReports),
  ]).catch((e: Error) => setError(e.message));
  useEffect(() => { void load(); }, [month]);

  const addAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await api.post('/finance/accounts', { name: accountName, balance: Number(accountBalance) });
      setAccountName('');
      setAccountBalance('0');
      await load();
    } catch (e) { setError((e as Error).message); }
  };

  const addTransaction = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await api[editingId ? 'patch' : 'post'](editingId ? `/finance/transactions/${editingId}` : '/finance/transactions', {
        accountId, description, amount: Number(amount), category, date,
      });
      setDescription('');
      setAmount('');
      setCategory('');
      setEditingId(null);
      await load();
    } catch (e) { setError((e as Error).message); }
  };

  const editTransaction = (transaction: Transaction) => {
    setEditingId(transaction.id);
    setAccountId(transaction.accountId);
    setDescription(transaction.description);
    setAmount(String(transaction.amount));
    setCategory(transaction.category);
    setDate(transaction.date);
  };

  const addTransfer = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await api.post('/finance/transfers', { fromAccountId: accountId, toAccountId: transferTo, amount: Number(transferAmount), date });
      setTransferTo('');
      setTransferAmount('');
      await load();
    } catch (e) { setError((e as Error).message); }
  };

  const removeTransaction = async (id: string) => {
    try {
      await api.delete(`/finance/transactions/${id}`);
      await load();
    } catch (e) { setError((e as Error).message); }
  };

  const addCategory = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await api.post('/finance/categories', { name: newCategory });
      setNewCategory('');
      await load();
    } catch (e) { setError((e as Error).message); }
  };

  const saveBudget = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await api.post('/finance/budgets', { month, category: budgetCategory, allocated: Number(budgetAmount), carryover });
      setBudgetAmount('');
      await load();
    } catch (e) { setError((e as Error).message); }
  };

  const addGroup = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await api.post('/finance/category-groups', { name: groupName });
      setGroupName('');
      await load();
    } catch (e) { setError((e as Error).message); }
  };

  const previewImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !accountId) {
      setError('Selecione a conta que receberá o CSV antes de importar.');
      return;
    }
    try {
      const rows = parseCsv(await file.text(), accountId);
      setImportRows(rows);
      setImportPreview(await api.post<ImportPreview>('/finance/import/preview', { rows }));
    } catch (e) { setError((e as Error).message); }
    event.target.value = '';
  };

  const commitImport = async () => {
    setImporting(true);
    try {
      await api.post('/finance/import/commit', { rows: importRows, commit: true });
      setImportRows([]);
      setImportPreview(null);
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setImporting(false); }
  };

  return (
    <AppShell title="Finanças" status="módulo interno do Sano">
      <div className="finance-page">
        {error && <div className="error">{error}</div>}
        <div className="finance-toolbar">
          <label>Mês
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
        </div>
        <div className="finance-summary">
          <section className="card"><span>Saldo movimentado</span><strong>{money(data?.summary.balance ?? 0)}</strong></section>
          <section className="card"><span>Receitas</span><strong className="finance-positive">{money(data?.summary.income ?? 0)}</strong></section>
          <section className="card"><span>Despesas</span><strong className="finance-negative">{money(data?.summary.expenses ?? 0)}</strong></section>
        </div>
        <button type="button" className="ghost finance-reports-toggle" onClick={() => setShowReports((value) => !value)}>
          {showReports ? 'Ocultar relatórios' : 'Exibir relatórios'}
        </button>
        {showReports && reports && (
          <section className="card finance-reports">
            <h2>Relatórios</h2>
            <div className="finance-report-columns">
              <div>
                <h3>Gastos por categoria</h3>
                {reports.byCategory.length ? reports.byCategory.map((item) => (
                  <div className="finance-report-row" key={item.category}><span>{item.category}</span><strong>{money(item.spent)}</strong></div>
                )) : <p className="muted">Ainda não há gastos neste período.</p>}
              </div>
              <div>
                <h3>Fluxo dos últimos seis meses</h3>
                {reports.months.map((item) => (
                  <div className="finance-report-row" key={item.month}><span>{item.month}</span><strong className={item.balance >= 0 ? 'finance-positive' : 'finance-negative'}>{money(item.balance)}</strong></div>
                ))}
              </div>
            </div>
          </section>
        )}
        <section className="card finance-import">
          <h2>Importar CSV</h2>
          <p className="muted">Use as colunas <code>date,description,amount,category</code>. Valores negativos são despesas.</p>
          <input type="file" accept=".csv,text/csv" onChange={(event) => void previewImport(event)} disabled={!accountId} />
          {!accountId && <p className="muted small">Selecione uma conta na lista antes de escolher o arquivo.</p>}
          {importPreview && (
            <div className="finance-import-preview">
              <p>{importPreview.preview.length} linha(s) pronta(s), {importPreview.duplicates.length} duplicata(s), {importPreview.errors.length} inválida(s).</p>
              {importPreview.errors.map((item) => <div className="error" key={item.line}>Linha {item.line}: {item.message}</div>)}
              <button type="button" onClick={() => void commitImport()} disabled={importing || !importPreview.preview.length || importPreview.errors.length > 0}>
                {importing ? 'Importando...' : 'Confirmar importação'}
              </button>
            </div>
          )}
        </section>

        <div className="finance-columns">
          <section className="card">
            <h2>Contas</h2>
            {data?.accounts.length ? data.accounts.map((account) => (
              <button key={account.id} type="button" className={`finance-account ${account.id === accountId ? 'selected' : ''}`} onClick={() => setAccountId(account.id)}>
                <span>{account.name}</span><strong>{money(account.balance)}</strong>
              </button>
            )) : <p className="muted">Crie sua primeira conta para começar.</p>}
            <form className="finance-form" onSubmit={addAccount}>
              <input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Nome da conta" aria-label="Nome da conta" required />
              <input value={accountBalance} onChange={(e) => setAccountBalance(e.target.value)} type="number" step="0.01" placeholder="Saldo inicial" aria-label="Saldo inicial" />
              <button type="submit">Adicionar conta</button>
            </form>
          </section>

          <section className="card">
            <h2>{editingId ? 'Editar transação' : 'Nova transação'}</h2>
            <form className="finance-form" onSubmit={addTransaction}>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} required aria-label="Conta">
                <option value="">Selecione uma conta</option>
                {data?.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição" required />
              <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="0.01" placeholder="Valor (negativo = despesa)" required />
              <select value={category} onChange={(e) => setCategory(e.target.value)} required aria-label="Categoria">
                <option value="">Selecione uma categoria</option>
                {data?.categories.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <input value={date} onChange={(e) => setDate(e.target.value)} type="date" required />
              <button type="submit" disabled={!data?.accounts.length || !data?.categories.length}>{editingId ? 'Salvar alteração' : 'Registrar transação'}</button>
              {editingId && <button type="button" className="ghost" onClick={() => setEditingId(null)}>Cancelar edição</button>}
            </form>
            <h2 className="finance-subheading">Transferir entre contas</h2>
            <form className="finance-form" onSubmit={addTransfer}>
              <select value={transferTo} onChange={(e) => setTransferTo(e.target.value)} required aria-label="Conta de destino">
                <option value="">Conta de destino</option>
                {data?.accounts.filter((account) => account.id !== accountId).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
              <input value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} type="number" min="0.01" step="0.01" placeholder="Valor da transferência" required />
              <button type="submit" disabled={!accountId || !transferTo}>Transferir</button>
            </form>
          </section>

          <section className="card">
            <h2>Categorias e orçamento</h2>
            <form className="finance-form" onSubmit={addCategory}>
              <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Nova categoria" required />
              <button type="submit">Adicionar categoria</button>
            </form>
            <form className="finance-form" onSubmit={addGroup}>
              <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Novo grupo de categorias" required />
              <button type="submit">Adicionar grupo</button>
            </form>
            {data?.categoryGroups.map((group) => <div className="finance-category-group" key={group.id}>{group.name}<span>{group.categories.length} categorias</span></div>)}
            <form className="finance-form" onSubmit={saveBudget}>
              <select value={budgetCategory} onChange={(e) => setBudgetCategory(e.target.value)} required aria-label="Categoria do orçamento">
                <option value="">Categoria do orçamento</option>
                {data?.categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
              <input value={budgetAmount} onChange={(e) => setBudgetAmount(e.target.value)} type="number" min="0" step="0.01" placeholder="Limite mensal" required />
              <label className="finance-check"><input type="checkbox" checked={carryover} onChange={(e) => setCarryover(e.target.checked)} /> Carregar saldo restante para o próximo mês</label>
              <button type="submit" disabled={!data?.categories.length}>Salvar orçamento</button>
            </form>
            <div className="finance-budgets">
              {data?.budgets.map((budget) => {
                const percentage = budget.allocated > 0 ? Math.min((budget.spent / budget.allocated) * 100, 100) : 0;
                return <div key={budget.id} className="finance-budget"><div><span>{budget.category}</span><strong>{money(budget.spent)} / {money(budget.allocated)} · disponível {money(budget.available)}</strong></div><progress value={percentage} max="100" /></div>;
              })}
            </div>
          </section>
        </div>

        <section className="card">
          <h2>Transações</h2>
          <div className="table-wrap">
            <table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Valor</th><th /></tr></thead>
              <tbody>{data?.transactions.slice().reverse().map((transaction) => (
                <tr key={transaction.id}>
                  <td>{transaction.date}</td><td>{transaction.description}</td><td>{transaction.category}</td>
                  <td className={transaction.amount >= 0 ? 'ok' : 'bad'}>{money(transaction.amount)}</td>
                  <td className="actions"><button type="button" className="ghost" onClick={() => editTransaction(transaction)}>Editar</button><button type="button" className="ghost" onClick={() => void removeTransaction(transaction.id)}>Excluir</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
