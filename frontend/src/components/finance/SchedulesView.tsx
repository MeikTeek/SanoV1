import { useEffect, useState } from 'react';
import { financeApi } from '../../services/finance.service';
import type { FinanceOverview, FinanceSchedule, Frequency, ScheduleInput } from '../../types/finance';
import { FREQUENCY_LABEL, dayLabel, money, moneyPlain, parseMoneyInput, today } from './format';
import { CategorySelect } from './TransactionForm';
import { IconPlus, IconRepeat } from './icons';
import RowMenu from './RowMenu';

interface Props {
  data: FinanceOverview;
  schedules: FinanceSchedule[];
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}

const TRANSFER = 'transfer:';

function ScheduleForm({ data, editing, onSubmit, onCancel }: {
  data: FinanceOverview; editing: FinanceSchedule | null;
  onSubmit: (input: ScheduleInput) => Promise<void>; onCancel: () => void;
}) {
  const open = data.accounts.filter((a) => !a.closed);
  const [name, setName] = useState(editing?.name ?? '');
  const [accountId, setAccountId] = useState(editing?.accountId ?? open[0]?.id ?? '');
  const [kind, setKind] = useState<'out' | 'in'>(editing && editing.amount > 0 ? 'in' : 'out');
  const [amount, setAmount] = useState(editing ? moneyPlain(Math.abs(editing.amount)) : '');
  const [target, setTarget] = useState(editing?.transferAccountId ? `${TRANSFER}${editing.transferAccountId}` : editing?.categoryId ?? '');
  const [transferCategory, setTransferCategory] = useState(editing?.transferAccountId ? editing.categoryId ?? '' : '');
  const [frequency, setFrequency] = useState<Frequency>(editing?.frequency ?? 'MONTHLY');
  const [interval, setInterval] = useState(String(editing?.interval ?? 1));
  const [nextDate, setNextDate] = useState(editing?.nextDate ?? today());
  const [autoPost, setAutoPost] = useState(editing?.autoPost ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const account = data.accounts.find((a) => a.id === accountId);
  const transferTo = target.startsWith(TRANSFER) ? data.accounts.find((a) => a.id === target.slice(TRANSFER.length)) : undefined;
  const crosses = !!transferTo && !!account && transferTo.offBudget !== account.offBudget;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cents = parseMoneyInput(amount);
    if (!cents || cents <= 0) { setError('Informe um valor, por exemplo 1.800,00.'); return; }
    setBusy(true); setError('');
    try {
      await onSubmit({
        name, accountId, amount: kind === 'out' ? -cents : cents, frequency,
        interval: Math.max(1, Number(interval) || 1), nextDate, autoPost,
        payee: transferTo ? null : name,
        categoryId: transferTo ? (crosses ? transferCategory || null : null) : target || null,
        transferAccountId: transferTo?.id ?? null,
        active: true, // salvar reativa um agendamento encerrado
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="fin-entry" onSubmit={submit}>
      <div className="fin-segment" role="radiogroup" aria-label="Tipo">
        <button type="button" role="radio" aria-checked={kind === 'out'} className={kind === 'out' ? 'on' : ''} onClick={() => setKind('out')}>Despesa</button>
        <button type="button" role="radio" aria-checked={kind === 'in'} className={kind === 'in' ? 'on' : ''} onClick={() => setKind('in')}>Receita</button>
      </div>
      <div className="fin-entry-grid">
        <label className="fin-entry-wide">Nome<input value={name} maxLength={100} required placeholder="Ex.: Aluguel, Netflix, Salário" onChange={(e) => setName(e.target.value)} /></label>
        <label>Valor<input value={amount} inputMode="decimal" required placeholder="0,00" onChange={(e) => setAmount(e.target.value)} /></label>
        <label>Conta
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
            {open.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <label className="fin-entry-wide">Categoria ou transferência
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">{account?.offBudget ? 'Fora do orçamento' : 'Sem categoria'}</option>
            {!account?.offBudget && data.groups.map((group) => (
              <optgroup key={group.id} label={group.name}>
                {group.categories.filter((c) => !c.hidden || c.id === target).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
            ))}
            <optgroup label="Transferir para">
              {open.filter((a) => a.id !== accountId).map((a) => <option key={a.id} value={`${TRANSFER}${a.id}`}>⇄ {a.name}</option>)}
            </optgroup>
          </select>
        </label>
        {crosses && !account?.offBudget && (
          <label className="fin-entry-wide">Categoria (sai do orçamento)<CategorySelect data={data} value={transferCategory} onChange={setTransferCategory} /></label>
        )}
        <label>Repetir
          <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
            {(Object.keys(FREQUENCY_LABEL) as Frequency[]).map((f) => <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>)}
          </select>
        </label>
        {frequency !== 'ONCE' && (
          <label>A cada<input type="number" min={1} max={52} value={interval} onChange={(e) => setInterval(e.target.value)} /></label>
        )}
        <label>Próximo vencimento<input type="date" value={nextDate} required onChange={(e) => setNextDate(e.target.value)} /></label>
      </div>
      <div className="fin-entry-actions">
        <label className="fin-check"><input type="checkbox" checked={autoPost} onChange={(e) => setAutoPost(e.target.checked)} /> Lançar automaticamente no vencimento</label>
        <button type="button" className="ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" disabled={busy || !accountId || !name.trim()}>{editing ? 'Salvar' : 'Criar agendamento'}</button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

/** Valor mensal equivalente, para o total "comprometido por mês". */
function monthly(s: FinanceSchedule) {
  if (s.frequency === 'ONCE') return 0;
  if (s.frequency === 'WEEKLY') return (s.amount * 52) / 12 / s.interval;
  if (s.frequency === 'YEARLY') return s.amount / 12 / s.interval;
  return s.amount / s.interval;
}

export default function SchedulesView({ data, schedules, onChanged, onError }: Props) {
  const [form, setForm] = useState<'new' | FinanceSchedule | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (form && form !== 'new' && !schedules.some((s) => s.id === form.id)) setForm(null); }, [schedules, form]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try { await action(); await onChanged(); } catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  };

  const active = schedules.filter((s) => s.active);
  const outMonthly = active.filter((s) => s.amount < 0).reduce((sum, s) => sum + monthly(s), 0);
  const inMonthly = active.filter((s) => s.amount > 0).reduce((sum, s) => sum + monthly(s), 0);
  const categoryName = new Map(data.groups.flatMap((g) => g.categories).map((c) => [c.id, c.name]));

  const sections: { title: string; items: FinanceSchedule[] }[] = [
    { title: 'Atrasados', items: schedules.filter((s) => s.status === 'overdue') },
    { title: 'Vencem hoje', items: schedules.filter((s) => s.status === 'due') },
    { title: 'Próximos', items: schedules.filter((s) => s.status === 'upcoming') },
    { title: 'Encerrados', items: schedules.filter((s) => s.status === 'done') },
  ].filter((section) => section.items.length > 0);

  return (
    <div className="fin-schedules">
      <header className="fin-register-head">
        <div className="fin-register-title">
          <span className="fin-account-icon lg"><IconRepeat size={20} /></span>
          <div><h2>Contas recorrentes</h2><p className="muted">Aluguel, assinaturas, salário — lance com um clique ou automaticamente.</p></div>
        </div>
        {data.accounts.some((a) => !a.closed) && (
          <button type="button" onClick={() => setForm('new')}><IconPlus /> Novo agendamento</button>
        )}
      </header>

      <div className="fin-stat-row">
        <div><span>Saídas por mês</span><strong className="fin-neg">{money(Math.round(-outMonthly))}</strong></div>
        <div><span>Entradas por mês</span><strong className="fin-pos">{money(Math.round(inMonthly))}</strong></div>
        <div><span>Ativos</span><strong>{active.length}</strong></div>
      </div>

      {form && (
        <section className="fin-card fin-form-card">
          <h3>{form === 'new' ? 'Novo agendamento' : `Editar ${form.name}`}</h3>
          <ScheduleForm key={form === 'new' ? 'new' : form.id} data={data} editing={form === 'new' ? null : form}
            onCancel={() => setForm(null)}
            onSubmit={async (input) => {
              if (form === 'new') await financeApi.createSchedule(input);
              else await financeApi.updateSchedule(form.id, input);
              setForm(null);
              await onChanged();
            }} />
        </section>
      )}

      {sections.map((section) => (
        <section key={section.title} className="fin-card fin-sched-section">
          <h3 className="fin-eyebrow">{section.title}</h3>
          {section.items.map((s) => (
            <div key={s.id} className={`fin-sched ${s.status}`}>
              <div className="fin-sched-date">
                <strong>{s.nextDate.slice(8, 10)}</strong>
                <span>{new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(new Date(`${s.nextDate}T12:00:00`)).replace('.', '')}</span>
              </div>
              <div className="fin-tx-main">
                <strong>{s.name}{s.autoPost && <span className="fin-chip">automático</span>}</strong>
                <div className="fin-tx-meta">
                  <span>{FREQUENCY_LABEL[s.frequency]}{s.interval > 1 && s.frequency !== 'ONCE' ? ` · a cada ${s.interval}` : ''}</span>
                  <span>{s.accountName}{s.transferAccountName ? ` ⇄ ${s.transferAccountName}` : ''}</span>
                  {s.categoryId && <span>{categoryName.get(s.categoryId)}</span>}
                </div>
              </div>
              <strong className={`fin-tx-amount ${s.amount < 0 ? '' : 'fin-pos'}`}>{money(s.amount)}</strong>
              <div className="fin-sched-actions">
                {s.active && <button type="button" className="ghost small" disabled={busy} onClick={() => void run(() => financeApi.postSchedule(s.id))}>Lançar</button>}
                <RowMenu items={[
                  ...(s.active ? [{ label: `Pular ${dayLabel(s.nextDate).slice(0, 5)}`, onSelect: () => void run(() => financeApi.skipSchedule(s.id)) }] : []),
                  { label: 'Editar', onSelect: () => setForm(s) },
                  { label: 'Excluir', danger: true, onSelect: () => void run(() => financeApi.deleteSchedule(s.id)) },
                ]} />
              </div>
            </div>
          ))}
        </section>
      ))}

      {schedules.length === 0 && !form && (
        <div className="fin-card fin-empty">
          <strong>Nenhuma conta recorrente</strong>
          <span>Cadastre aluguel, assinaturas e salário para ver os vencimentos no orçamento.</span>
        </div>
      )}
    </div>
  );
}
