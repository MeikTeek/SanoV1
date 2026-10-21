import { useCallback, useEffect, useState } from 'react';
import { financeApi } from '../../services/finance.service';
import type { FinanceOverview, FinanceTransaction, TransactionInput } from '../../types/finance';
import { dayLabel, money, monthLabel } from './format';
import TransactionForm, { CategorySelect } from './TransactionForm';
import ImportPanel from './ImportPanel';

interface Props {
  data: FinanceOverview;
  month: string;
  accountId: string | null;
  /** id de categoria ou 'uncategorized' (vindo do orçamento). */
  categoryFilter: string | null;
  onClearFilter: () => void;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}

export default function RegisterView({ data, month, accountId, categoryFilter, onClearFilter, onChanged, onError }: Props) {
  const [rows, setRows] = useState<FinanceTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<FinanceTransaction | null>(null);
  const [importing, setImporting] = useState(false);

  const account = data.accounts.find((a) => a.id === accountId) ?? null;
  const categoryName = categoryFilter === 'uncategorized'
    ? 'Sem categoria'
    : data.groups.flatMap((g) => g.categories).find((c) => c.id === categoryFilter)?.name;

  // Busca com pequeno atraso para não consultar a cada tecla.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await financeApi.transactions({
        accountId: accountId ?? undefined,
        month,
        search: query || undefined,
        categoryId: categoryFilter && categoryFilter !== 'uncategorized' ? categoryFilter : undefined,
        uncategorized: categoryFilter === 'uncategorized',
      }));
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [accountId, month, query, categoryFilter, onError]);

  useEffect(() => { void load(); }, [load, data]);
  useEffect(() => { setEditing(null); setImporting(false); }, [accountId]);

  const refresh = async () => { await onChanged(); };

  const act = async (action: () => Promise<unknown>) => {
    try { await action(); await refresh(); } catch (e) { onError((e as Error).message); }
  };

  const save = async (input: TransactionInput) => {
    if (editing) await financeApi.updateTransaction(editing.id, input);
    else await financeApi.createTransaction(input);
    setEditing(null);
    await refresh();
  };

  const toInput = (row: FinanceTransaction, categoryId: string | null): TransactionInput => ({
    accountId: row.accountId, date: row.date, amount: row.amount, payee: row.payee,
    categoryId, notes: row.notes, cleared: row.cleared, transferAccountId: row.transferAccountId,
  });

  const totalIn = rows.reduce((sum, r) => sum + Math.max(r.amount, 0), 0);
  const totalOut = rows.reduce((sum, r) => sum + Math.min(r.amount, 0), 0);
  const offBudgetIds = new Set(data.accounts.filter((a) => a.offBudget).map((a) => a.id));

  return (
    <div className="fin-register">
      <header className="fin-register-head">
        <div>
          <h2>{account?.name ?? 'Todas as contas'}</h2>
          {account && (
            <p className="muted">
              Saldo {money(account.balance)} · conferido {money(account.clearedBalance)}
              {account.balance !== account.clearedBalance && ` · a conferir ${money(account.balance - account.clearedBalance)}`}
            </p>
          )}
        </div>
        <div className="fin-register-tools">
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar em todo o histórico" aria-label="Buscar transações" />
          {account && !account.closed && (
            <button type="button" className="ghost" onClick={() => setImporting((v) => !v)}>{importing ? 'Fechar importação' : 'Importar CSV'}</button>
          )}
        </div>
      </header>

      {categoryName && (
        <div className="fin-filter-chip">
          Filtrando: <strong>{categoryName}</strong>{categoryFilter !== 'uncategorized' && ` · ${monthLabel(month)}`}
          <button type="button" className="fin-link" onClick={onClearFilter}>limpar filtro</button>
        </div>
      )}

      {importing && account && (
        <ImportPanel data={data} account={account} onDone={async () => { setImporting(false); await refresh(); }} />
      )}

      {!account?.closed && data.accounts.some((a) => !a.closed) && (
        <section className="card">
          <TransactionForm data={data} accountId={accountId} editing={editing} onSubmit={save} onCancel={() => setEditing(null)} />
        </section>
      )}

      <section className="card fin-tx-card">
        <div className="fin-tx-summary muted">
          {query ? `${rows.length} resultado(s) para "${query}"` : categoryFilter === 'uncategorized' ? `${rows.length} transação(ões) sem categoria` : `${monthLabel(month)} · ${rows.length} transação(ões)`}
          <span>Entradas <strong className="fin-pos">{money(totalIn)}</strong></span>
          <span>Saídas <strong className="fin-neg">{money(-totalOut)}</strong></span>
        </div>
        <div className="table-wrap">
          <table className="fin-tx-table">
            <thead>
              <tr>
                <th aria-label="Conferida" />
                <th>Data</th>
                {!accountId && <th>Conta</th>}
                <th>Beneficiário</th>
                <th>Categoria</th>
                <th>Notas</th>
                <th className="fin-num">Saída</th>
                <th className="fin-num">Entrada</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={editing?.id === row.id ? 'editing' : ''}>
                  <td>
                    <button type="button" className={`fin-cleared ${row.cleared ? 'on' : ''}`} aria-pressed={row.cleared}
                      title={row.cleared ? 'Conferida no extrato' : 'Marcar como conferida'}
                      onClick={() => void act(() => financeApi.setCleared(row.id, !row.cleared))}>✓</button>
                  </td>
                  <td className="fin-nowrap">{dayLabel(row.date)}</td>
                  {!accountId && <td className="fin-nowrap">{row.accountName}</td>}
                  <td>{row.transferAccountName ? <span className="fin-transfer">↔ {row.transferAccountName}</span> : row.payee ?? <span className="muted">—</span>}</td>
                  <td className="fin-cat-cell">
                    {row.transferAccountId || offBudgetIds.has(row.accountId)
                      ? <span className="muted">{row.transferAccountId ? 'Transferência' : 'Fora do orçamento'}</span>
                      : (
                        <CategorySelect data={data} value={row.categoryId ?? ''}
                          onChange={(value) => void act(() => financeApi.updateTransaction(row.id, toInput(row, value || null)))} />
                      )}
                  </td>
                  <td className="fin-notes">{row.notes}</td>
                  <td className="fin-num fin-neg">{row.amount < 0 ? money(-row.amount) : ''}</td>
                  <td className="fin-num fin-pos">{row.amount > 0 ? money(row.amount) : ''}</td>
                  <td className="actions fin-nowrap">
                    <button type="button" className="fin-link" onClick={() => { setEditing(row); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>editar</button>
                    <button type="button" className="fin-link danger"
                      onClick={() => {
                        if (window.confirm(row.transferAccountId ? 'Excluir a transferência (nas duas contas)?' : 'Excluir esta transação?')) {
                          void act(() => financeApi.deleteTransaction(row.id));
                        }
                      }}>excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && rows.length === 0 && (
            <p className="fin-empty">{data.accounts.length === 0 ? 'Crie uma conta para começar a lançar transações.' : 'Nenhuma transação aqui.'}</p>
          )}
        </div>
      </section>
    </div>
  );
}
