import { useCallback, useEffect, useMemo, useState } from 'react';
import { financeApi } from '../../services/finance.service';
import type { FinanceOverview, FinanceTransaction, TransactionInput } from '../../types/finance';
import { dayHeading, money, monthLabel } from './format';
import { AccountIcon, IconCheck, IconEdit, IconPlus, IconTrash, IconUpload } from './icons';
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

/** Cor estável por nome: o mesmo beneficiário sempre tem o mesmo avatar. */
function avatarHue(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

export default function RegisterView({ data, month, accountId, categoryFilter, onClearFilter, onChanged, onError }: Props) {
  const [rows, setRows] = useState<FinanceTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<FinanceTransaction | null>(null);
  const [panel, setPanel] = useState<'form' | 'import' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const account = data.accounts.find((a) => a.id === accountId) ?? null;
  const categoryName = categoryFilter === 'uncategorized'
    ? 'Sem categoria'
    : data.groups.flatMap((g) => g.categories).find((c) => c.id === categoryFilter)?.name;

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
  useEffect(() => { setEditing(null); setPanel(null); }, [accountId]);

  const act = async (action: () => Promise<unknown>) => {
    try { await action(); await onChanged(); } catch (e) { onError((e as Error).message); }
  };

  const save = async (input: TransactionInput) => {
    if (editing) await financeApi.updateTransaction(editing.id, input);
    else await financeApi.createTransaction(input);
    setEditing(null);
    setPanel(null);
    await onChanged();
  };

  const toInput = (row: FinanceTransaction, categoryId: string | null): TransactionInput => ({
    accountId: row.accountId, date: row.date, amount: row.amount, payee: row.payee,
    categoryId, notes: row.notes, cleared: row.cleared, transferAccountId: row.transferAccountId,
  });

  const days = useMemo(() => {
    const map = new Map<string, FinanceTransaction[]>();
    for (const row of rows) map.set(row.date, [...(map.get(row.date) ?? []), row]);
    return [...map.entries()];
  }, [rows]);

  const totalIn = rows.reduce((sum, r) => sum + Math.max(r.amount, 0), 0);
  const totalOut = rows.reduce((sum, r) => sum + Math.min(r.amount, 0), 0);
  const offBudgetIds = new Set(data.accounts.filter((a) => a.offBudget).map((a) => a.id));
  const canAdd = account ? !account.closed : data.accounts.some((a) => !a.closed);

  return (
    <div className="fin-register">
      <header className="fin-register-head">
        <div className="fin-register-title">
          {account && <span className="fin-account-icon lg"><AccountIcon type={account.type} size={20} /></span>}
          <div>
            <h2>{account?.name ?? 'Todas as contas'}</h2>
            <p className="muted">
              {query ? `Busca em todo o histórico: "${query}"` : categoryFilter === 'uncategorized' ? 'Transações sem categoria' : monthLabel(month)}
            </p>
          </div>
        </div>
        <div className="fin-register-tools">
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar beneficiário ou nota" aria-label="Buscar transações" />
          {account && !account.closed && (
            <button type="button" className={`ghost ${panel === 'import' ? 'on' : ''}`} onClick={() => setPanel((p) => (p === 'import' ? null : 'import'))}>
              <IconUpload /> Importar
            </button>
          )}
          {canAdd && (
            <button type="button" onClick={() => { setEditing(null); setPanel((p) => (p === 'form' && !editing ? null : 'form')); }}>
              <IconPlus /> Nova transação
            </button>
          )}
        </div>
      </header>

      <div className="fin-stat-row">
        {account ? (
          <>
            <div><span>Saldo</span><strong className={account.balance < 0 ? 'fin-neg' : ''}>{money(account.balance)}</strong></div>
            <div><span>Conferido</span><strong>{money(account.clearedBalance)}</strong></div>
            <div><span>A conferir</span><strong>{money(account.balance - account.clearedBalance)}</strong></div>
          </>
        ) : null}
        <div><span>Entradas</span><strong className="fin-pos">{money(totalIn)}</strong></div>
        <div><span>Saídas</span><strong className="fin-neg">{money(-totalOut)}</strong></div>
      </div>

      {categoryName && (
        <div className="fin-filter-chip">
          Filtrando por <strong>{categoryName}</strong>
          <button type="button" className="fin-link" onClick={onClearFilter}>limpar</button>
        </div>
      )}

      {panel === 'import' && account && (
        <ImportPanel data={data} account={account} onDone={async () => { setPanel(null); await onChanged(); }} />
      )}
      {panel === 'form' && (
        <section className="fin-card fin-form-card">
          <h3>{editing ? 'Editar transação' : 'Nova transação'}</h3>
          <TransactionForm data={data} accountId={accountId} editing={editing} onSubmit={save}
            onCancel={() => { setEditing(null); setPanel(null); }} />
        </section>
      )}

      <section className="fin-card fin-tx-list">
        {days.map(([date, items]) => {
          const net = items.reduce((sum, r) => sum + r.amount, 0);
          return (
            <div key={date} className="fin-day">
              <div className="fin-day-head">
                <span>{dayHeading(date)}</span>
                <span className={net < 0 ? 'fin-neg' : net > 0 ? 'fin-pos' : ''}>{money(net)}</span>
              </div>
              {items.map((row) => {
                const name = row.transferAccountName ? `Transferência ${row.amount < 0 ? 'para' : 'de'} ${row.transferAccountName}` : row.payee ?? 'Sem beneficiário';
                const isCategorizable = !row.transferAccountId && !offBudgetIds.has(row.accountId);
                return (
                  <div key={row.id} className={`fin-tx ${editing?.id === row.id ? 'editing' : ''} ${!row.categoryId && isCategorizable ? 'needs-category' : ''}`}>
                    <button type="button" className={`fin-cleared ${row.cleared ? 'on' : ''}`} aria-pressed={row.cleared}
                      title={row.cleared ? 'Conferida no extrato' : 'Marcar como conferida'}
                      onClick={() => void act(() => financeApi.setCleared(row.id, !row.cleared))}><IconCheck size={12} /></button>
                    <span className={`fin-avatar ${row.transferAccountId ? 'transfer' : ''}`}
                      style={row.transferAccountId ? undefined : { '--hue': avatarHue(name) } as React.CSSProperties}>
                      {row.transferAccountId ? '⇄' : name.charAt(0).toUpperCase()}
                    </span>
                    <div className="fin-tx-main">
                      <strong>{name}</strong>
                      <div className="fin-tx-meta">
                        {isCategorizable ? (
                          <span className="fin-chip-select">
                            <CategorySelect data={data} value={row.categoryId ?? ''}
                              onChange={(value) => void act(() => financeApi.updateTransaction(row.id, toInput(row, value || null)))} />
                          </span>
                        ) : (
                          <span className="fin-chip muted">{row.transferAccountId ? 'Transferência' : 'Fora do orçamento'}</span>
                        )}
                        {!accountId && <span className="fin-tx-account">{row.accountName}</span>}
                        {row.notes && <span className="fin-tx-notes" title={row.notes}>{row.notes}</span>}
                      </div>
                    </div>
                    <strong className={`fin-tx-amount ${row.amount < 0 ? '' : 'fin-pos'}`}>{money(row.amount)}</strong>
                    <div className="fin-tx-actions">
                      {confirmDelete === row.id ? (
                        <>
                          <button type="button" className="danger small" onClick={() => { setConfirmDelete(null); void act(() => financeApi.deleteTransaction(row.id)); }}>
                            Excluir{row.transferAccountId ? ' as duas' : ''}
                          </button>
                          <button type="button" className="ghost small" onClick={() => setConfirmDelete(null)}>Não</button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="fin-icon-btn" aria-label="Editar" title="Editar"
                            onClick={() => { setEditing(row); setPanel('form'); }}><IconEdit /></button>
                          <button type="button" className="fin-icon-btn danger" aria-label="Excluir" title="Excluir"
                            onClick={() => setConfirmDelete(row.id)}><IconTrash /></button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
        {!loading && rows.length === 0 && (
          <div className="fin-empty">
            <strong>{data.accounts.length === 0 ? 'Nenhuma conta ainda' : 'Nada por aqui'}</strong>
            <span>{data.accounts.length === 0 ? 'Crie uma conta na barra lateral para começar.' : query ? 'Nenhuma transação encontrada.' : 'Sem transações neste mês.'}</span>
          </div>
        )}
      </section>
    </div>
  );
}
