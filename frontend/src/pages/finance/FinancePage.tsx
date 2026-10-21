import { useCallback, useEffect, useState } from 'react';
import AppShell from '../../components/layout/AppShell';
import BudgetView from '../../components/finance/BudgetView';
import RegisterView from '../../components/finance/RegisterView';
import ReportsView from '../../components/finance/ReportsView';
import AccountPanel from '../../components/finance/AccountPanel';
import { currentMonth, money, monthLabel, shiftMonth } from '../../components/finance/format';
import { financeApi } from '../../services/finance.service';
import type { FinanceAccount, FinanceOverview } from '../../types/finance';
import '../../styles/finance.css';

/**
 * Finanças com orçamento por envelopes (modelo do Actual Budget):
 *
 *   [ Orçamento | Relatórios | Contas ]   [ visão selecionada ]
 *
 * O mês escolhido no topo vale para todas as visões.
 */
type View = { kind: 'budget' } | { kind: 'reports' } | { kind: 'register'; accountId: string | null };

export default function FinancePage() {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<FinanceOverview | null>(null);
  const [view, setView] = useState<View>({ kind: 'budget' });
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [panel, setPanel] = useState<'new' | FinanceAccount | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    try {
      setData(await financeApi.overview(month));
      setRefreshKey((k) => k + 1);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [month]);

  useEffect(() => { void load(); }, [load]);
  const onError = useCallback((message: string) => setError(message), []);

  const openRegister = (accountId: string | null) => {
    setCategoryFilter(null);
    setPanel(null);
    setView({ kind: 'register', accountId });
  };

  const accountGroup = (title: string, accounts: FinanceAccount[]) => accounts.length > 0 && (
    <div className="fin-side-group">
      <div className="fin-side-title">
        <span>{title}</span>
        <span>{money(accounts.reduce((sum, a) => sum + a.balance, 0))}</span>
      </div>
      {accounts.map((account) => (
        <div key={account.id} className={`fin-side-item ${view.kind === 'register' && view.accountId === account.id ? 'active' : ''} ${account.closed ? 'closed' : ''}`}>
          <button type="button" className="fin-side-link" onClick={() => openRegister(account.id)}>
            <span>{account.name}</span>
            <span className={account.balance < 0 ? 'fin-neg' : ''}>{money(account.balance)}</span>
          </button>
          <button type="button" className="fin-side-edit" title="Configurar conta" aria-label={`Configurar ${account.name}`}
            onClick={() => setPanel(account)}>⋯</button>
        </div>
      ))}
    </div>
  );

  const open = data?.accounts.filter((a) => !a.closed) ?? [];
  const closed = data?.accounts.filter((a) => a.closed) ?? [];
  const toBudget = data?.budget.toBudget ?? 0;

  return (
    <AppShell title="Finanças" status={data ? `${monthLabel(month)} · a orçar ${money(toBudget)}` : 'carregando…'}>
      <div className="fin-page">
        <aside className="fin-side">
          <nav className="fin-side-nav">
            <button type="button" className={view.kind === 'budget' ? 'active' : ''} onClick={() => { setPanel(null); setView({ kind: 'budget' }); }}>
              <span>Orçamento</span>
              <span className={`fin-side-badge ${toBudget < 0 ? 'neg' : toBudget > 0 ? 'pos' : ''}`}>{money(toBudget)}</span>
            </button>
            <button type="button" className={view.kind === 'reports' ? 'active' : ''} onClick={() => { setPanel(null); setView({ kind: 'reports' }); }}>
              Relatórios
            </button>
            <button type="button" className={view.kind === 'register' && view.accountId === null ? 'active' : ''} onClick={() => openRegister(null)}>
              <span>Todas as contas</span>
              <span>{money(open.reduce((sum, a) => sum + a.balance, 0))}</span>
            </button>
          </nav>
          {accountGroup('No orçamento', open.filter((a) => !a.offBudget))}
          {accountGroup('Fora do orçamento', open.filter((a) => a.offBudget))}
          {closed.length > 0 && (
            <button type="button" className="fin-link fin-side-more" onClick={() => setShowClosed((v) => !v)}>
              {showClosed ? 'Esconder' : 'Mostrar'} contas fechadas ({closed.length})
            </button>
          )}
          {showClosed && accountGroup('Fechadas', closed)}
          <button type="button" className="ghost fin-side-add" onClick={() => setPanel('new')}>+ Nova conta</button>
        </aside>

        <main className="fin-main">
          <div className="fin-month">
            <button type="button" className="icon-btn" aria-label="Mês anterior" onClick={() => setMonth((m) => shiftMonth(m, -1))}>‹</button>
            <strong>{monthLabel(month)}</strong>
            <button type="button" className="icon-btn" aria-label="Próximo mês" onClick={() => setMonth((m) => shiftMonth(m, 1))}>›</button>
            {month !== currentMonth() && <button type="button" className="fin-link" onClick={() => setMonth(currentMonth())}>hoje</button>}
          </div>

          {error && <p className="error" role="alert">{error} <button type="button" className="fin-link" onClick={() => setError('')}>fechar</button></p>}

          {panel && (
            <AccountPanel
              key={panel === 'new' ? 'new' : panel.id}
              account={panel === 'new' ? null : panel}
              onClose={() => setPanel(null)}
              onSaved={async (accountId) => {
                await load();
                if (!accountId && view.kind === 'register' && panel !== 'new') setView({ kind: 'budget' });
              }}
            />
          )}

          {data && data.accounts.length === 0 && !panel && (
            <section className="card fin-welcome">
              <h2>Comece cadastrando suas contas</h2>
              <p className="muted">
                Informe o saldo atual de cada conta. Esse dinheiro vai para <strong>A orçar</strong>, e você distribui
                entre as categorias (envelopes) até zerar. Cada gasto sai do envelope da categoria. Assim você sabe
                quanto ainda pode gastar em cada coisa.
              </p>
              <button type="button" onClick={() => setPanel('new')}>Criar primeira conta</button>
            </section>
          )}

          {data && view.kind === 'budget' && (
            <BudgetView data={data} month={month} onChanged={load} onError={onError}
              onShowCategory={(categoryId) => { setCategoryFilter(categoryId); setView({ kind: 'register', accountId: null }); }} />
          )}
          {data && view.kind === 'register' && (
            <RegisterView data={data} month={month} accountId={view.accountId} categoryFilter={categoryFilter}
              onClearFilter={() => setCategoryFilter(null)} onChanged={load} onError={onError} />
          )}
          {view.kind === 'reports' && <ReportsView month={month} refreshKey={refreshKey} onError={onError} />}
        </main>
      </div>
    </AppShell>
  );
}
