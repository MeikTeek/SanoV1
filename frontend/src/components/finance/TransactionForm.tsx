import { useEffect, useState } from 'react';
import type { FinanceOverview, FinanceTransaction, TransactionInput } from '../../types/finance';
import { moneyPlain, parseMoneyInput, today } from './format';

interface Props {
  data: FinanceOverview;
  /** Conta fixa (extrato de uma conta) ou null (todas as contas: o usuário escolhe). */
  accountId: string | null;
  editing: FinanceTransaction | null;
  onSubmit: (input: TransactionInput) => Promise<void>;
  onCancel: () => void;
}

const TRANSFER = 'transfer:';

export function CategorySelect({ data, value, onChange, disabled, offBudget, label = 'Categoria' }: {
  data: FinanceOverview; value: string; onChange: (value: string) => void; disabled?: boolean; offBudget?: boolean; label?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-label={label}>
      <option value="">{offBudget ? 'Fora do orçamento' : 'Sem categoria'}</option>
      {!offBudget && data.groups.map((group) => (
        <optgroup key={group.id} label={group.name}>
          {group.categories.filter((c) => !c.hidden || c.id === value).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

export default function TransactionForm({ data, accountId, editing, onSubmit, onCancel }: Props) {
  const openAccounts = data.accounts.filter((a) => !a.closed);
  const [account, setAccount] = useState(accountId ?? openAccounts[0]?.id ?? '');
  const [date, setDate] = useState(today());
  const [payee, setPayee] = useState('');
  const [target, setTarget] = useState('');
  const [notes, setNotes] = useState('');
  const [outflow, setOutflow] = useState('');
  const [inflow, setInflow] = useState('');
  const [cleared, setCleared] = useState(false);
  const [transferCategory, setTransferCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (accountId) setAccount(accountId); }, [accountId]);

  useEffect(() => {
    if (!editing) return;
    setAccount(editing.accountId);
    setDate(editing.date);
    setPayee(editing.payee ?? '');
    setTarget(editing.transferAccountId ? `${TRANSFER}${editing.transferAccountId}` : editing.categoryId ?? '');
    setNotes(editing.notes ?? '');
    setOutflow(editing.amount < 0 ? moneyPlain(-editing.amount) : '');
    setInflow(editing.amount > 0 ? moneyPlain(editing.amount) : '');
    setCleared(editing.cleared);
    setTransferCategory(editing.transferAccountId ? editing.categoryId ?? '' : '');
    setError('');
  }, [editing]);

  const reset = () => {
    setPayee(''); setTarget(''); setNotes(''); setOutflow(''); setInflow(''); setCleared(false); setTransferCategory(''); setError('');
  };

  const selected = data.accounts.find((a) => a.id === account);
  const isTransfer = target.startsWith(TRANSFER);
  const transferTo = isTransfer ? data.accounts.find((a) => a.id === target.slice(TRANSFER.length)) : undefined;
  // Transferência só leva categoria quando cruza o limite do orçamento.
  const transferCrosses = !!transferTo && !!selected && transferTo.offBudget !== selected.offBudget;

  const choosePayee = (value: string) => {
    setPayee(value);
    const known = data.payees.find((p) => p.name.toLowerCase() === value.trim().toLowerCase());
    if (known?.lastCategoryId && !target) setTarget(known.lastCategoryId);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const out = outflow ? parseMoneyInput(outflow) : 0;
    const inc = inflow ? parseMoneyInput(inflow) : 0;
    if (out === null || inc === null || out < 0 || inc < 0) { setError('Valor inválido. Use, por exemplo, 49,90.'); return; }
    const amount = inc - out;
    if (amount === 0) { setError('Informe um valor de saída ou de entrada.'); return; }
    setBusy(true);
    try {
      await onSubmit({
        accountId: account,
        date,
        amount,
        payee: isTransfer ? null : payee || null,
        categoryId: isTransfer ? (transferCrosses ? transferCategory || null : null) : target || null,
        transferAccountId: transferTo?.id ?? null,
        notes: notes || null,
        cleared,
      });
      reset();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="fin-entry" onSubmit={submit}>
      <div className="fin-entry-grid">
        {!accountId && (
          <label>Conta
            <select value={account} onChange={(e) => setAccount(e.target.value)} required>
              {openAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        )}
        <label>Data<input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
        <label className="fin-entry-wide">Beneficiário
          <input list="fin-payees" value={isTransfer ? '' : payee} disabled={isTransfer} placeholder={isTransfer ? 'Transferência' : 'Ex.: Mercado, Salário'}
            onChange={(e) => choosePayee(e.target.value)} maxLength={200} />
          <datalist id="fin-payees">{data.payees.map((p) => <option key={p.id} value={p.name} />)}</datalist>
        </label>
        <label className="fin-entry-wide">Categoria ou transferência
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">{selected?.offBudget ? 'Fora do orçamento' : 'Sem categoria'}</option>
            {!selected?.offBudget && data.groups.map((group) => (
              <optgroup key={group.id} label={group.name}>
                {group.categories.filter((c) => !c.hidden || c.id === target).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
            ))}
            <optgroup label="Transferir para / receber de">
              {openAccounts.filter((a) => a.id !== account).map((a) => (
                <option key={a.id} value={`${TRANSFER}${a.id}`}>↔ {a.name}</option>
              ))}
            </optgroup>
          </select>
        </label>
        {transferCrosses && !selected?.offBudget && (
          <label className="fin-entry-wide">Categoria (sai do orçamento)
            <CategorySelect data={data} value={transferCategory} onChange={setTransferCategory} />
          </label>
        )}
        <label>Saída<input value={outflow} inputMode="decimal" placeholder="0,00" onChange={(e) => { setOutflow(e.target.value); if (e.target.value) setInflow(''); }} /></label>
        <label>Entrada<input value={inflow} inputMode="decimal" placeholder="0,00" onChange={(e) => { setInflow(e.target.value); if (e.target.value) setOutflow(''); }} /></label>
        <label className="fin-entry-wide">Notas<input value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} /></label>
      </div>
      <div className="fin-entry-actions">
        <label className="fin-check"><input type="checkbox" checked={cleared} onChange={(e) => setCleared(e.target.checked)} /> Conferida no extrato</label>
        {editing && <button type="button" className="ghost" onClick={() => { reset(); onCancel(); }}>Cancelar</button>}
        <button type="submit" disabled={busy || !account}>{editing ? 'Salvar alteração' : 'Adicionar'}</button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
