import { useCallback, useEffect, useState } from 'react';
import AppShell from '../../components/layout/AppShell';
import BudgetView from '../../components/finance/BudgetView';
import RegisterView from '../../components/finance/RegisterView';
import ReportsView from '../../components/finance/ReportsView';
import SchedulesView from '../../components/finance/SchedulesView';
import AccountPanel from '../../components/finance/AccountPanel';
import { currentMonth, money, monthLabel, shiftMonth } from '../../components/finance/format';
import { AccountIcon, IconBudget, IconChart, IconLeft, IconList, IconPlus, IconRepeat, IconRight } from '../../components/finance/icons';
import { financeApi } from '../../services/finance.service';
import type { FinanceAccount, FinanceOverview, FinanceSchedule } from '../../types/finance';
import '../../styles/finance.css';

/**
 * Finanças com orçamento por envelopes (modelo do Actual Budget).
 *
 *   ┌ contas ┐ ┌ abas · mês ───────────────────────────┐
 *   │        │ │ Orçamento | Transações | Recorrentes |… │
 *   │        │ │ visão selecionada                      │
 *   └────────┘ └────────────────────────────────────────┘
 *
 * O mês escolhido no topo vale para todas as abas.
 */
type Tab = 'budget' | 'register' | 'schedules' | 'reports';

const TABS: { id: Tab; label: string; icon: JSX.Element }[] = [
  { id: 'budget', label: 'Orçamento', icon: <IconBudget size={16} /> },
  { id: 'register', label: 'Transações', icon: <IconList size={16} /> },
  { id: 'schedules', label: 'Recorrentes', icon: <IconRepeat size={16} /> },
  { id: 'reports', label: 'Relatórios', icon: <IconChart size={16} /> },
];

export default function FinancePage() {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<FinanceOverview | null>(null);
  const [schedules, setSchedules] = useState<FinanceSchedule[]>([]);
  const [tab, setTab] = useState<Tab>('budget');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [panel, setPanel] = useState<'new' | FinanceAccount | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    try {
      // A visão geral lança os agendamentos automáticos vencidos; a lista vem depois.
      const overview = await financeApi.overview(month);
      setData(overview);
      setSchedules(await financeApi.schedules());
      setRefreshKey((k) => k + 1);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [month]);

  useEffect(() => { void load(); }, [load]);
  const onError = useCallback((message: string) => setError(message), []);

  const openRegister = (id: string | null) => {
    setCategoryFilter(null);
    setPanel(null);
    setAccountId(id);
    setTab('register');
  };

  const accounts = data?.accounts ?? [];
  const open = accounts.filter((a) => !a.closed);
  const closed = accounts.filter((a) => a.closed);
  const netWorth = open.reduce((sum, a) => sum + a.balance, 0);
  const toBudget = data?.budget.toBudget ?? 0;

  const accountGroup = (title: string, list: FinanceAccount[]) => list.length > 0 && (
    <div className="fin-side-group">
      <div className="fin-side-title"><span>{title}</span><span>{money(list.reduce((sum, a) => sum + a.balance, 0))}</span></div>
      {list.map((account) => (
        <div key={account.id} className={`fin-side-item ${tab === 'register' && accountId === account.id ? 'active' : ''} ${account.closed ? 'closed' : ''}`}>
          <button type="button" className="fin-side-link" onClick={() => openRegister(account.id)}>
            <span className="fin-account-icon"><AccountIcon type={account.type} /></span>
            <span className="fin-side-name">{account.name}</span>
            <span className={`fin-side-balance ${account.balance < 0 ? 'fin-neg' : ''}`}>{money(account.balance)}</span>
          </button>
          <button type="button" className="fin-side-edit" title="Configurar conta" aria-label={`Configurar ${account.name}`}
            onClick={() => setPanel(account)}>⋯</button>
        </div>
      ))}
    </div>
  );

  return (
    <AppShell title="Finanças" status={data ? `${monthLabel(month)} · a orçar ${money(toBudget)}` : 'carregando…'} flush>
      <div className="fin-page">
        <aside className="fin-side">
          <div className="fin-networth">
            <span className="fin-eyebrow">Patrimônio</span>
            <strong className={netWorth < 0 ? 'fin-neg' : ''}>{money(netWorth)}</strong>
            <button type="button" className={`fin-side-all ${tab === 'register' && accountId === null ? 'active' : ''}`} onClick={() => openRegister(null)}>
              Todas as contas
            </button>
          </div>
          {accountGroup('No orçamento', open.filter((a) => !a.offBudget))}
          {accountGroup('Fora do orçamento', open.filter((a) => a.offBudget))}
          {closed.length > 0 && (
            <button type="button" className="fin-link fin-side-more" onClick={() => setShowClosed((v) => !v)}>
              {showClosed ? 'Esconder' : 'Mostrar'} fechadas ({closed.length})
            </button>
          )}
          {showClosed && accountGroup('Fechadas', closed)}
          <button type="button" className="fin-side-add" onClick={() => setPanel('new')}><IconPlus size={14} /> Nova conta</button>
        </aside>

        <main className="fin-main">
          <header className="fin-top">
            <nav className="fin-tabs" aria-label="Seções de finanças">
              {TABS.map((t) => (
                <button key={t.id} type="button" className={tab === t.id ? 'active' : ''} aria-current={tab === t.id ? 'page' : undefined}
                  onClick={() => { setPanel(null); if (t.id === 'register') { setAccountId(null); setCategoryFilter(null); } setTab(t.id); }}>
                  {t.icon}<span>{t.label}</span>
                  {t.id === 'budget' && toBudget !== 0 && <span className={`fin-tab-badge ${toBudget < 0 ? 'neg' : ''}`}>{money(toBudget)}</span>}
                  {t.id === 'schedules' && schedules.some((s) => s.status === 'overdue' || s.status === 'due') && <span className="fin-tab-dot" aria-label="vencimentos pendentes" />}
                </button>
              ))}
            </nav>
            {tab !== 'schedules' && (
              <div className="fin-month">
                <button type="button" className="fin-icon-btn" aria-label="Mês anterior" onClick={() => setMonth((m) => shiftMonth(m, -1))}><IconLeft /></button>
                <strong>{monthLabel(month)}</strong>
                <button type="button" className="fin-icon-btn" aria-label="Próximo mês" onClick={() => setMonth((m) => shiftMonth(m, 1))}><IconRight /></button>
                {month !== currentMonth() && <button type="button" className="ghost small" onClick={() => setMonth(currentMonth())}>Hoje</button>}
              </div>
            )}
          </header>

          <div className="fin-content">
            {error && (
              <p className="error" role="alert">{error} <button type="button" className="fin-link" onClick={() => setError('')}>fechar</button></p>
            )}

            {panel && (
              <AccountPanel
                key={panel === 'new' ? 'new' : panel.id}
                account={panel === 'new' ? null : panel}
                onClose={() => setPanel(null)}
                onSaved={async (savedId) => {
                  await load();
                  if (!savedId && panel !== 'new' && accountId === panel.id) openRegister(null);
                }}
              />
            )}

            {data && data.accounts.length === 0 && !panel && (
              <section className="fin-card fin-welcome">
                <span className="fin-eyebrow">Primeiros passos</span>
                <h2>Cadastre suas contas</h2>
                <p className="muted">
                  Informe o saldo atual de cada conta. Esse dinheiro vai para <strong>A orçar</strong> e você distribui entre
                  as categorias até zerar. Cada gasto sai da categoria dele, então você sempre sabe quanto ainda pode gastar.
                </p>
                <button type="button" onClick={() => setPanel('new')}><IconPlus /> Criar primeira conta</button>
              </section>
            )}

            {data && tab === 'budget' && (
              <BudgetView data={data} month={month} schedules={schedules} onChanged={load} onError={onError}
                onOpenSchedules={() => setTab('schedules')}
                onShowCategory={(categoryId) => { setAccountId(null); setCategoryFilter(categoryId); setTab('register'); }} />
            )}
            {data && tab === 'register' && (
              <RegisterView data={data} month={month} accountId={accountId} categoryFilter={categoryFilter}
                onClearFilter={() => setCategoryFilter(null)} onChanged={load} onError={onError} />
            )}
            {data && tab === 'schedules' && <SchedulesView data={data} schedules={schedules} onChanged={load} onError={onError} />}
            {tab === 'reports' && <ReportsView month={month} refreshKey={refreshKey} onError={onError} />}
          </div>
        </main>
      </div>
    </AppShell>
  );
}
