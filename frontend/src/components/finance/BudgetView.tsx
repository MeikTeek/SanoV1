import { useEffect, useState } from 'react';
import { financeApi } from '../../services/finance.service';
import type { FinanceCategory, FinanceGroup, FinanceOverview, FinanceSchedule } from '../../types/finance';
import { dayLabel, money, moneyPlain, parseMoneyInput } from './format';
import { IconDown, IconPlus, IconRepeat } from './icons';
import RowMenu from './RowMenu';

interface Props {
  data: FinanceOverview;
  month: string;
  schedules: FinanceSchedule[];
  onChanged: () => Promise<void>;
  onShowCategory: (categoryId: string) => void;
  onOpenSchedules: () => void;
  onError: (message: string) => void;
}

type Editing =
  | { kind: 'group'; id: string }
  | { kind: 'category'; id: string }
  | { kind: 'new-category'; groupId: string }
  | { kind: 'new-group'; isIncome: boolean }
  | { kind: 'delete-category'; id: string }
  | null;

const tone = (value: number) => (value > 0 ? 'pos' : value < 0 ? 'neg' : 'zero');
const COLLAPSED_KEY = 'sano:finance:collapsed';

function readCollapsed(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]') as string[]); } catch { return new Set(); }
}

/** Campo de valor orçado: mostra formatado, edita como texto e salva ao sair. */
function BudgetCell({ value, onSave }: { value: number; onSave: (cents: number) => Promise<void> }) {
  const [text, setText] = useState(moneyPlain(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(moneyPlain(value)); }, [value, focused]);

  const commit = async () => {
    setFocused(false);
    const cents = parseMoneyInput(text || '0');
    if (cents === null || cents < 0) { setText(moneyPlain(value)); return; }
    if (cents !== value) await onSave(cents);
  };

  return (
    <input
      className="fin-budget-input"
      value={text}
      inputMode="decimal"
      aria-label="Valor orçado"
      onFocus={(e) => { setFocused(true); e.currentTarget.select(); }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') { setText(moneyPlain(value)); setFocused(false); e.currentTarget.blur(); }
      }}
    />
  );
}

function NameInput({ initial, placeholder, onSave, onCancel }: {
  initial: string; placeholder: string; onSave: (name: string) => Promise<void>; onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  return (
    <form className="fin-inline-form" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void onSave(name.trim()); }}>
      <input autoFocus value={name} placeholder={placeholder} maxLength={100} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }} />
      <button type="submit" disabled={!name.trim()}>Salvar</button>
      <button type="button" className="ghost" onClick={onCancel}>Cancelar</button>
    </form>
  );
}

export default function BudgetView({ data, month, schedules, onChanged, onShowCategory, onOpenSchedules, onError }: Props) {
  const [editing, setEditing] = useState<Editing>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [moveTo, setMoveTo] = useState('');
  const [busy, setBusy] = useState(false);
  const { budget } = data;

  const toggleGroup = (id: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next])); } catch { /* sem storage: só não lembra */ }
    return next;
  });

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      setEditing(null);
      await onChanged();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const visible = <T extends { hidden: boolean }>(items: T[]) => (showHidden ? items : items.filter((item) => !item.hidden));
  const expenseGroups = visible(data.groups.filter((g) => !g.isIncome));
  const incomeGroups = visible(data.groups.filter((g) => g.isIncome));
  const hasHidden = data.groups.some((g) => g.hidden || g.categories.some((c) => c.hidden));
  const expenseIds = new Set(data.groups.filter((g) => !g.isIncome).flatMap((g) => g.categories.map((c) => c.id)));
  const overspent = Object.entries(budget.categories).filter(([id, c]) => expenseIds.has(id) && c.balance < 0);
  const spent = -budget.totalSpent;
  const spentPct = budget.totalBudgeted > 0 ? Math.min(100, (spent / budget.totalBudgeted) * 100) : 0;
  const pending = schedules.filter((s) => s.active && s.nextDate.slice(0, 7) <= month).slice(0, 4);

  const sameKindCategories = (category: FinanceCategory) => {
    const isIncome = data.groups.find((g) => g.categories.some((c) => c.id === category.id))?.isIncome;
    return data.groups.filter((g) => g.isIncome === isIncome).flatMap((g) => g.categories).filter((c) => c.id !== category.id);
  };

  const groupTotals = (group: FinanceGroup) => group.categories.reduce((sum, c) => {
    const v = budget.categories[c.id];
    return v ? { budgeted: sum.budgeted + v.budgeted, spent: sum.spent + v.spent, balance: sum.balance + v.balance } : sum;
  }, { budgeted: 0, spent: 0, balance: 0 });

  const groupMenu = (group: FinanceGroup) => [
    { label: 'Nova categoria', onSelect: () => setEditing({ kind: 'new-category', groupId: group.id }) },
    { label: 'Renomear grupo', onSelect: () => setEditing({ kind: 'group', id: group.id }) },
    { label: group.hidden ? 'Mostrar grupo' : 'Ocultar grupo', onSelect: () => void run(() => financeApi.updateGroup(group.id, { hidden: !group.hidden })) },
    ...(group.categories.length === 0
      ? [{ label: 'Excluir grupo', danger: true, onSelect: () => void run(() => financeApi.deleteGroup(group.id)) }]
      : []),
  ];

  const categoryMenu = (category: FinanceCategory, isIncome: boolean, carryover: boolean) => [
    { label: 'Ver transações', onSelect: () => onShowCategory(category.id) },
    { label: 'Renomear', onSelect: () => setEditing({ kind: 'category', id: category.id }) },
    ...(!isIncome ? [{
      label: carryover ? 'Desligar saldo negativo acumulado' : 'Manter saldo negativo no envelope',
      onSelect: () => void run(() => financeApi.setBudget({ month, categoryId: category.id, carryover: !carryover })),
    }] : []),
    { label: category.hidden ? 'Mostrar' : 'Ocultar', onSelect: () => void run(() => financeApi.updateCategory(category.id, { hidden: !category.hidden })) },
    { label: 'Excluir', danger: true, onSelect: () => { setMoveTo(''); setEditing({ kind: 'delete-category', id: category.id }); } },
  ];

  const categoryRow = (group: FinanceGroup, category: FinanceCategory) => {
    const v = budget.categories[category.id] ?? { budgeted: 0, spent: 0, balance: 0, carryover: false };

    if (editing?.kind === 'category' && editing.id === category.id) {
      return (
        <div className="fin-cat" key={category.id}>
          <NameInput initial={category.name} placeholder="Nome da categoria" onCancel={() => setEditing(null)}
            onSave={(name) => run(() => financeApi.updateCategory(category.id, { name }))} />
        </div>
      );
    }
    if (editing?.kind === 'delete-category' && editing.id === category.id) {
      return (
        <div className="fin-cat fin-delete-row" key={category.id}>
          <span>Excluir <strong>{category.name}</strong>?</span>
          <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} aria-label="Mover transações para">
            <option value="">Deixar transações sem categoria</option>
            {sameKindCategories(category).map((c) => <option key={c.id} value={c.id}>Mover para {c.name}</option>)}
          </select>
          <button type="button" className="danger" disabled={busy}
            onClick={() => void run(() => financeApi.deleteCategory(category.id, moveTo || undefined))}>Excluir</button>
          <button type="button" className="ghost" onClick={() => setEditing(null)}>Cancelar</button>
        </div>
      );
    }

    if (group.isIncome) {
      return (
        <div className={`fin-cat fin-cat-income ${category.hidden ? 'is-hidden' : ''}`} key={category.id}>
          <div className="fin-cat-name"><span>{category.name}</span></div>
          <button type="button" className="fin-num fin-spent" onClick={() => onShowCategory(category.id)}>{money(v.spent)}</button>
          <RowMenu items={categoryMenu(category, true, false)} />
        </div>
      );
    }

    // Quanto do dinheiro do envelope (orçado + herdado) já foi usado.
    const funds = v.balance - v.spent;
    const used = funds > 0 ? Math.min(100, (-v.spent / funds) * 100) : v.spent < 0 ? 100 : 0;
    // Gastou tudo o que planejou (saldo 0) não é alerta; alerta é estar quase acabando.
    const state = v.balance < 0 ? 'over' : used >= 85 && v.balance > 0 ? 'warn' : 'ok';

    return (
      <div className={`fin-cat ${category.hidden ? 'is-hidden' : ''}`} key={category.id}>
        <div className="fin-cat-name">
          <span>{category.name}{v.carryover && <span className="fin-carry-tag" title="Saldo negativo continua neste envelope"><IconRepeat size={12} /></span>}</span>
          <div className={`fin-progress ${state}`} aria-hidden="true"><div style={{ width: `${used}%` }} /></div>
        </div>
        <div className="fin-num"><BudgetCell value={v.budgeted}
          onSave={(cents) => run(() => financeApi.setBudget({ month, categoryId: category.id, budgeted: cents }))} /></div>
        <button type="button" className="fin-num fin-spent" title="Ver transações" onClick={() => onShowCategory(category.id)}>{money(-v.spent)}</button>
        <div className="fin-num"><span className={`fin-pill ${tone(v.balance)}`}>{money(v.balance)}</span></div>
        <RowMenu items={categoryMenu(category, false, v.carryover)} />
      </div>
    );
  };

  const groupCard = (group: FinanceGroup) => {
    const totals = groupTotals(group);
    const isCollapsed = collapsed.has(group.id);
    return (
      <section className={`fin-group ${group.hidden ? 'is-hidden' : ''}`} key={group.id}>
        {editing?.kind === 'group' && editing.id === group.id ? (
          <div className="fin-group-head">
            <NameInput initial={group.name} placeholder="Nome do grupo" onCancel={() => setEditing(null)}
              onSave={(name) => run(() => financeApi.updateGroup(group.id, { name }))} />
          </div>
        ) : (
          <div className={`fin-group-head ${group.isIncome ? 'income' : ''}`}>
            <button type="button" className="fin-group-toggle" aria-expanded={!isCollapsed} onClick={() => toggleGroup(group.id)}>
              <span className={`fin-chevron ${isCollapsed ? 'closed' : ''}`}><IconDown /></span>
              <span>{group.name}</span>
              <small>{group.categories.length}</small>
            </button>
            {group.isIncome ? (
              <div className="fin-num">{money(totals.spent)}</div>
            ) : (
              <>
                <div className="fin-num">{money(totals.budgeted)}</div>
                <div className="fin-num">{money(-totals.spent)}</div>
                <div className="fin-num"><strong className={totals.balance < 0 ? 'fin-neg' : ''}>{money(totals.balance)}</strong></div>
              </>
            )}
            <RowMenu items={groupMenu(group)} label={`Ações do grupo ${group.name}`} />
          </div>
        )}
        {!isCollapsed && (
          <div className="fin-group-body">
            {visible(group.categories).map((category) => categoryRow(group, category))}
            {editing?.kind === 'new-category' && editing.groupId === group.id ? (
              <div className="fin-cat">
                <NameInput initial="" placeholder="Nova categoria" onCancel={() => setEditing(null)}
                  onSave={(name) => run(() => financeApi.createCategory(group.id, name))} />
              </div>
            ) : (
              <button type="button" className="fin-add-row" onClick={() => setEditing({ kind: 'new-category', groupId: group.id })}>
                <IconPlus size={14} /> Categoria
              </button>
            )}
          </div>
        )}
      </section>
    );
  };

  const newGroup = (isIncome: boolean) => editing?.kind === 'new-group' && editing.isIncome === isIncome ? (
    <section className="fin-group"><div className="fin-group-head">
      <NameInput initial="" placeholder={isIncome ? 'Novo grupo de receitas' : 'Novo grupo'} onCancel={() => setEditing(null)}
        onSave={(name) => run(() => financeApi.createGroup(name, isIncome))} />
    </div></section>
  ) : (
    <button type="button" className="fin-add-group" onClick={() => setEditing({ kind: 'new-group', isIncome })}>
      <IconPlus size={14} /> {isIncome ? 'Grupo de receitas' : 'Novo grupo'}
    </button>
  );

  return (
    <div className="fin-budget">
      <div className="fin-kpis">
        <section className={`fin-hero ${tone(budget.toBudget)}`}>
          <span className="fin-eyebrow">{budget.toBudget < 0 ? 'Orçado além do disponível' : 'A orçar'}</span>
          <strong className="fin-hero-value">{money(budget.toBudget)}</strong>
          <p>
            {budget.toBudget > 0 && 'Distribua esse valor entre as categorias abaixo.'}
            {budget.toBudget === 0 && 'Todo o dinheiro tem um destino.'}
            {budget.toBudget < 0 && 'Reduza valores orçados até zerar.'}
          </p>
          <dl className="fin-hero-math">
            <div><dt>Receitas do mês</dt><dd>{money(budget.income)}</dd></div>
            <div><dt>Sobra anterior</dt><dd>{money(budget.fromLastMonth)}</dd></div>
            {budget.lastMonthOverspent !== 0 && <div><dt>Estouro anterior</dt><dd className="fin-neg">{money(budget.lastMonthOverspent)}</dd></div>}
            <div><dt>Orçado</dt><dd>{money(-budget.totalBudgeted)}</dd></div>
          </dl>
        </section>
        <section className="fin-kpi">
          <span className="fin-eyebrow">Gasto no mês</span>
          <strong>{money(spent)}</strong>
          <div className={`fin-progress ${spent > budget.totalBudgeted ? 'over' : spentPct >= 85 ? 'warn' : 'ok'}`}><div style={{ width: `${spentPct}%` }} /></div>
          <small>{budget.totalBudgeted ? `${Math.round(spentPct)}% de ${money(budget.totalBudgeted)} orçados` : 'Nada orçado ainda'}</small>
        </section>
        <section className="fin-kpi">
          <span className="fin-eyebrow">Nos envelopes</span>
          <strong className={budget.totalBalance < 0 ? 'fin-neg' : ''}>{money(budget.totalBalance)}</strong>
          <small>{overspent.length ? `${overspent.length} categoria${overspent.length > 1 ? 's' : ''} estourada${overspent.length > 1 ? 's' : ''}` : 'Nenhuma categoria estourada'}</small>
        </section>
      </div>

      <div className="fin-toolbar">
        <button type="button" className="ghost" disabled={busy} onClick={() => void run(() => financeApi.copyLastMonth(month))}>Copiar mês anterior</button>
        {overspent.length > 0 && budget.toBudget > 0 && (
          <button type="button" className="ghost" disabled={busy} onClick={() => void run(() => financeApi.coverOverspending(month))}>Cobrir estouros</button>
        )}
        {hasHidden && (
          <label className="fin-check"><input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> Mostrar ocultas</label>
        )}
      </div>

      {data.uncategorized > 0 && (
        <button type="button" className="fin-banner" onClick={() => onShowCategory('uncategorized')}>
          <strong>{data.uncategorized}</strong> {data.uncategorized === 1 ? 'transação sem categoria fica' : 'transações sem categoria ficam'} fora do orçamento.
          <span>Categorizar →</span>
        </button>
      )}

      {pending.length > 0 && (
        <section className="fin-upcoming">
          <div className="fin-upcoming-head"><span className="fin-eyebrow">Vencimentos</span>
            <button type="button" className="fin-link" onClick={onOpenSchedules}>ver todos</button></div>
          <div className="fin-upcoming-list">
            {pending.map((s) => (
              <div key={s.id} className={`fin-upcoming-item ${s.status}`}>
                <div><strong>{s.name}</strong><small>{s.status === 'overdue' ? 'Atrasado · ' : s.status === 'due' ? 'Hoje · ' : ''}{dayLabel(s.nextDate).slice(0, 5)}</small></div>
                <span className={s.amount < 0 ? '' : 'fin-pos'}>{money(s.amount)}</span>
                <button type="button" className="ghost" disabled={busy} onClick={() => void run(() => financeApi.postSchedule(s.id))}>Lançar</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="fin-cols-head">
        <span>Categoria</span><span className="fin-num">Orçado</span><span className="fin-num">Gasto</span><span className="fin-num">Disponível</span><span />
      </div>
      {expenseGroups.map(groupCard)}
      {newGroup(false)}

      <div className="fin-cols-head fin-cols-income"><span>Receitas</span><span className="fin-num">Recebido</span><span /></div>
      {incomeGroups.map(groupCard)}
      {newGroup(true)}
    </div>
  );
}
