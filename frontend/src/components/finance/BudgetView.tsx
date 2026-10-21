import { useEffect, useState } from 'react';
import { financeApi } from '../../services/finance.service';
import type { FinanceCategory, FinanceGroup, FinanceOverview } from '../../types/finance';
import { money, moneyPlain, parseMoneyInput } from './format';

interface Props {
  data: FinanceOverview;
  month: string;
  onChanged: () => Promise<void>;
  onShowCategory: (categoryId: string) => void;
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

/** Nome editável no lugar (grupo, categoria, novo item). */
function NameInput({ initial, placeholder, onSave, onCancel }: {
  initial: string; placeholder: string; onSave: (name: string) => Promise<void>; onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  return (
    <form
      className="fin-inline-form"
      onSubmit={(e) => { e.preventDefault(); if (name.trim()) void onSave(name.trim()); }}
    >
      <input autoFocus value={name} placeholder={placeholder} maxLength={100} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }} />
      <button type="submit" disabled={!name.trim()}>Salvar</button>
      <button type="button" className="ghost" onClick={onCancel}>Cancelar</button>
    </form>
  );
}

export default function BudgetView({ data, month, onChanged, onShowCategory, onError }: Props) {
  const [editing, setEditing] = useState<Editing>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [moveTo, setMoveTo] = useState('');
  const [busy, setBusy] = useState(false);
  const { budget } = data;

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
  const overspent = Object.entries(budget.categories).some(([id, c]) =>
    c.balance < 0 && data.groups.some((g) => !g.isIncome && g.categories.some((cat) => cat.id === id)));
  const sameKindCategories = (category: FinanceCategory) => {
    const isIncome = data.groups.find((g) => g.categories.some((c) => c.id === category.id))?.isIncome;
    return data.groups.filter((g) => g.isIncome === isIncome).flatMap((g) => g.categories).filter((c) => c.id !== category.id);
  };

  const groupTotals = (group: FinanceGroup) => group.categories.reduce(
    (sum, c) => {
      const value = budget.categories[c.id];
      return value
        ? { budgeted: sum.budgeted + value.budgeted, spent: sum.spent + value.spent, balance: sum.balance + value.balance }
        : sum;
    },
    { budgeted: 0, spent: 0, balance: 0 },
  );

  const groupHeader = (group: FinanceGroup) => {
    const totals = groupTotals(group);
    if (editing?.kind === 'group' && editing.id === group.id) {
      return (
        <div className="fin-row fin-group-row" key={`g-${group.id}`}>
          <NameInput initial={group.name} placeholder="Nome do grupo" onCancel={() => setEditing(null)}
            onSave={(name) => run(() => financeApi.updateGroup(group.id, { name }))} />
        </div>
      );
    }
    return (
      <div className={`fin-row fin-group-row ${group.hidden ? 'is-hidden' : ''}`} key={`g-${group.id}`}>
        <div className="fin-name">
          <span>{group.name}</span>
          <span className="fin-row-actions">
            <button type="button" className="fin-link" onClick={() => setEditing({ kind: 'new-category', groupId: group.id })}>+ categoria</button>
            <button type="button" className="fin-link" onClick={() => setEditing({ kind: 'group', id: group.id })}>renomear</button>
            <button type="button" className="fin-link" onClick={() => void run(() => financeApi.updateGroup(group.id, { hidden: !group.hidden }))}>
              {group.hidden ? 'mostrar' : 'ocultar'}
            </button>
            {group.categories.length === 0 && (
              <button type="button" className="fin-link danger" onClick={() => void run(() => financeApi.deleteGroup(group.id))}>excluir</button>
            )}
          </span>
        </div>
        {group.isIncome ? (
          <div className="fin-num">{money(totals.spent)}</div>
        ) : (
          <>
            <div className="fin-num">{money(totals.budgeted)}</div>
            <div className="fin-num">{money(-totals.spent)}</div>
            <div className="fin-num">{money(totals.balance)}</div>
          </>
        )}
      </div>
    );
  };

  const categoryRow = (group: FinanceGroup, category: FinanceCategory) => {
    const value = budget.categories[category.id] ?? { budgeted: 0, spent: 0, balance: 0, carryover: false };

    if (editing?.kind === 'category' && editing.id === category.id) {
      return (
        <div className="fin-row fin-cat-row" key={category.id}>
          <NameInput initial={category.name} placeholder="Nome da categoria" onCancel={() => setEditing(null)}
            onSave={(name) => run(() => financeApi.updateCategory(category.id, { name }))} />
        </div>
      );
    }

    if (editing?.kind === 'delete-category' && editing.id === category.id) {
      return (
        <div className="fin-row fin-cat-row fin-delete-row" key={category.id}>
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

    const actions = (
      <span className="fin-row-actions">
        <button type="button" className="fin-link" onClick={() => setEditing({ kind: 'category', id: category.id })}>renomear</button>
        <button type="button" className="fin-link" onClick={() => void run(() => financeApi.updateCategory(category.id, { hidden: !category.hidden }))}>
          {category.hidden ? 'mostrar' : 'ocultar'}
        </button>
        <button type="button" className="fin-link danger" onClick={() => { setMoveTo(''); setEditing({ kind: 'delete-category', id: category.id }); }}>excluir</button>
      </span>
    );

    if (group.isIncome) {
      return (
        <div className={`fin-row fin-cat-row ${category.hidden ? 'is-hidden' : ''}`} key={category.id}>
          <div className="fin-name"><span>{category.name}</span>{actions}</div>
          <button type="button" className="fin-num fin-spent" onClick={() => onShowCategory(category.id)}>{money(value.spent)}</button>
        </div>
      );
    }

    return (
      <div className={`fin-row fin-cat-row ${category.hidden ? 'is-hidden' : ''}`} key={category.id}>
        <div className="fin-name"><span>{category.name}</span>{actions}</div>
        <div className="fin-num">
          <BudgetCell value={value.budgeted}
            onSave={(cents) => run(() => financeApi.setBudget({ month, categoryId: category.id, budgeted: cents }))} />
        </div>
        <button type="button" className="fin-num fin-spent" title="Ver transações" onClick={() => onShowCategory(category.id)}>
          {money(-value.spent)}
        </button>
        <div className="fin-num fin-balance-cell">
          <button
            type="button"
            className={`fin-carry ${value.carryover ? 'on' : ''}`}
            aria-pressed={value.carryover}
            title={value.carryover
              ? 'Saldo negativo continua neste envelope no próximo mês. Clique para desligar.'
              : 'Clique para manter saldo negativo neste envelope no próximo mês (em vez de descontar do "A orçar").'}
            onClick={() => void run(() => financeApi.setBudget({ month, categoryId: category.id, carryover: !value.carryover }))}
          >↻</button>
          <span className={`fin-pill ${tone(value.balance)}`}>{money(value.balance)}</span>
        </div>
      </div>
    );
  };

  const newCategoryRow = (group: FinanceGroup) =>
    editing?.kind === 'new-category' && editing.groupId === group.id && (
      <div className="fin-row fin-cat-row" key={`new-${group.id}`}>
        <NameInput initial="" placeholder="Nova categoria" onCancel={() => setEditing(null)}
          onSave={(name) => run(() => financeApi.createCategory(group.id, name))} />
      </div>
    );

  const newGroupRow = (isIncome: boolean) =>
    editing?.kind === 'new-group' && editing.isIncome === isIncome ? (
      <div className="fin-row fin-group-row">
        <NameInput initial="" placeholder={isIncome ? 'Novo grupo de receitas' : 'Novo grupo'} onCancel={() => setEditing(null)}
          onSave={(name) => run(() => financeApi.createGroup(name, isIncome))} />
      </div>
    ) : (
      <button type="button" className="fin-link fin-add-group" onClick={() => setEditing({ kind: 'new-group', isIncome })}>
        + {isIncome ? 'grupo de receitas' : 'novo grupo'}
      </button>
    );

  return (
    <div className="fin-budget">
      <section className={`fin-tobudget ${tone(budget.toBudget)}`}>
        <div className="fin-tobudget-main">
          <span>{budget.toBudget < 0 ? 'Orçado além do disponível' : 'A orçar'}</span>
          <strong>{money(budget.toBudget)}</strong>
          <small>
            {budget.toBudget > 0 && 'Distribua esse valor entre as categorias.'}
            {budget.toBudget === 0 && 'Todo o dinheiro tem um destino.'}
            {budget.toBudget < 0 && 'Reduza valores orçados até zerar.'}
          </small>
        </div>
        <dl className="fin-tobudget-breakdown">
          <div><dt>Receitas do mês</dt><dd>{money(budget.income)}</dd></div>
          <div><dt>Sobra do mês anterior</dt><dd>{money(budget.fromLastMonth)}</dd></div>
          <div><dt>Estouro do mês anterior</dt><dd>{money(budget.lastMonthOverspent)}</dd></div>
          <div><dt>Orçado neste mês</dt><dd>{money(-budget.totalBudgeted)}</dd></div>
        </dl>
        <div className="fin-tobudget-actions">
          <button type="button" className="ghost" disabled={busy} onClick={() => void run(() => financeApi.copyLastMonth(month))}>
            Copiar orçamento do mês anterior
          </button>
          {overspent && budget.toBudget > 0 && (
            <button type="button" className="ghost" disabled={busy} onClick={() => void run(() => financeApi.coverOverspending(month))}>
              Cobrir estouros
            </button>
          )}
          {hasHidden && (
            <label className="fin-check">
              <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> Mostrar ocultas
            </label>
          )}
        </div>
      </section>

      {data.uncategorized > 0 && (
        <button type="button" className="fin-banner" onClick={() => onShowCategory('uncategorized')}>
          {data.uncategorized} transaç{data.uncategorized === 1 ? 'ão' : 'ões'} sem categoria — elas não entram no orçamento. Categorizar →
        </button>
      )}

      <section className="card fin-table">
        <div className="fin-row fin-head">
          <div>Categoria</div><div className="fin-num">Orçado</div><div className="fin-num">Gasto</div><div className="fin-num">Disponível</div>
        </div>
        {expenseGroups.map((group) => [
          groupHeader(group),
          ...visible(group.categories).map((category) => categoryRow(group, category)),
          newCategoryRow(group),
        ])}
        <div className="fin-row fin-total">
          <div>Total</div>
          <div className="fin-num">{money(budget.totalBudgeted)}</div>
          <div className="fin-num">{money(-budget.totalSpent)}</div>
          <div className="fin-num">{money(budget.totalBalance)}</div>
        </div>
        {newGroupRow(false)}
      </section>

      <section className="card fin-table fin-income">
        <div className="fin-row fin-head"><div>Receitas</div><div className="fin-num">Recebido</div></div>
        {incomeGroups.map((group) => [
          groupHeader(group),
          ...visible(group.categories).map((category) => categoryRow(group, category)),
          newCategoryRow(group),
        ])}
        {newGroupRow(true)}
      </section>
    </div>
  );
}
