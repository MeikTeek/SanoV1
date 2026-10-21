import { useState } from 'react';
import { financeApi } from '../../services/finance.service';
import type { AccountType, FinanceAccount } from '../../types/finance';
import { ACCOUNT_TYPE_LABEL, parseMoneyInput, today } from './format';

interface Props {
  /** Conta existente = edição; null = nova conta. */
  account: FinanceAccount | null;
  onClose: () => void;
  onSaved: (accountId?: string) => Promise<void>;
}

export default function AccountPanel({ account, onClose, onSaved }: Props) {
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? 'CHECKING');
  const [offBudget, setOffBudget] = useState(account?.offBudget ?? false);
  const [balance, setBalance] = useState('');
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (action: () => Promise<unknown>, nextId?: string) => {
    setBusy(true); setError('');
    try {
      await action();
      await onSaved(nextId);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (account) {
      void run(() => financeApi.updateAccount(account.id, { name, type }), account.id);
      return;
    }
    const cents = balance ? parseMoneyInput(balance) : 0;
    if (cents === null) { setError('Saldo inválido. Use, por exemplo, 1.500,00 ou -200,00.'); return; }
    void run(() => financeApi.createAccount({ name, type, offBudget, balance: cents, date }));
  };

  return (
    <section className="card fin-account-panel">
      <h3>{account ? `Conta ${account.name}` : 'Nova conta'}</h3>
      <form className="fin-entry" onSubmit={submit}>
        <div className="fin-entry-grid">
          <label className="fin-entry-wide">Nome<input value={name} maxLength={100} required autoFocus onChange={(e) => setName(e.target.value)} placeholder="Ex.: Nubank, Carteira" /></label>
          <label>Tipo
            <select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
              {(Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[]).map((key) => <option key={key} value={key}>{ACCOUNT_TYPE_LABEL[key]}</option>)}
            </select>
          </label>
          {!account && (
            <>
              <label>Saldo atual<input value={balance} inputMode="decimal" placeholder="0,00" onChange={(e) => setBalance(e.target.value)} /></label>
              <label>Em<input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
            </>
          )}
        </div>
        {!account && (
          <label className="fin-check">
            <input type="checkbox" checked={offBudget} onChange={(e) => setOffBudget(e.target.checked)} />
            Fora do orçamento (investimentos, bens): conta no patrimônio, mas não nos envelopes
          </label>
        )}
        {!account && type === 'CREDIT' && (
          <p className="muted">Cartão de crédito: informe a fatura em aberto como valor negativo (ex.: -850,00).</p>
        )}
        <div className="fin-entry-actions">
          {account && (
            <>
              <button type="button" className="ghost" disabled={busy}
                onClick={() => void run(() => financeApi.updateAccount(account.id, { closed: !account.closed }), account.id)}>
                {account.closed ? 'Reabrir conta' : 'Fechar conta'}
              </button>
              <button type="button" className="ghost danger" disabled={busy}
                onClick={() => {
                  if (window.confirm(`Excluir "${account.name}" e todas as suas transações? Isso não pode ser desfeito.`)) {
                    void run(() => financeApi.deleteAccount(account.id));
                  }
                }}>Excluir</button>
            </>
          )}
          <button type="button" className="ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" disabled={busy || !name.trim()}>{account ? 'Salvar' : 'Criar conta'}</button>
        </div>
        {error && <p className="error">{error}</p>}
      </form>
    </section>
  );
}
