import { useCallback, useEffect, useState } from 'react';
import { getMyNumber, openDirectByNumber, type Conversation, type MyNumber } from '../../services/chat.service';
import { IconCopy, IconHash, IconSend } from '../ui/icons';

interface Props {
  onOpened: (conversation: Conversation) => void;
}

/** "00h 42min" / "1h 05min" a partir dos segundos restantes. */
const countdown = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}min` : `${m}min`;
};

/**
 * Painel do "número" do usuário.
 *
 * Ele é como um telefone: você mostra o seu para a pessoa digitar, ou digita o
 * dela para abrir a conversa. O código troca sozinho a cada 15 horas — por isso
 * a contagem regressiva em destaque.
 */
export default function NumberPanel({ onOpened }: Props) {
  const [number, setNumber] = useState<MyNumber | null>(null);
  const [mine, setMine] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');

  const load = useCallback(() => {
    getMyNumber().then(setNumber).catch((e) => setError((e as Error).message));
  }, []);

  useEffect(load, [load]);

  // Recontagem a cada 30s; ao zerar, pede um código novo (a janela virou).
  useEffect(() => {
    const t = window.setInterval(() => {
      setNumber((n) => {
        if (!n) return n;
        if (n.expiresInSeconds <= 0) {
          load();
          return n;
        }
        return { ...n, expiresInSeconds: n.expiresInSeconds - 30 };
      });
    }, 30_000);
    return () => window.clearInterval(t);
  }, [load]);

  const copy = async () => {
    if (!number) return;
    try {
      await navigator.clipboard.writeText(number.code);
      setCopied('ok');
      setTimeout(() => setCopied(''), 2000);
    } catch {
      // clipboard pode estar bloqueado: mostra o código em destaque para ler.
      setError('Não consegui copiar — anote o código acima.');
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = mine.trim();
    if (!value) return;

    setBusy(true);
    setError('');
    try {
      const conversation = await openDirectByNumber(value);
      setMine('');
      onOpened(conversation);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="number-panel">
      <div className="number-mine">
        <div className="number-head">
          <IconHash size={16} /> <span>Meu código</span>
        </div>
        {number ? (
          <>
            <button className="number-code" onClick={() => void copy()} title="Copiar código">
              {number.formatted}
            </button>
            <div className="number-meta">
              <span>expira em {countdown(number.expiresInSeconds)}</span>
              <button className="link-btn" onClick={() => void copy()}>
                <IconCopy size={14} /> {copied ? 'copiado' : 'copiar'}
              </button>
            </div>
            <small className="muted">
              Muda a cada {number.windowHours}h. Quem receber consegue te chamar mesmo sem saber seu usuário.
            </small>
          </>
        ) : (
          <div className="muted small">carregando…</div>
        )}
      </div>

      <form className="number-open" onSubmit={submit}>
        <label htmlFor="num-open">Tenho o código de alguém</label>
        <div className="inline">
          <input
            id="num-open"
            value={mine}
            onChange={(e) => setMine(e.target.value.toUpperCase())}
            placeholder="ABCD-2345"
            maxLength={9}
            autoComplete="off"
            spellCheck={false}
            aria-label="Código da outra pessoa"
          />
          <button type="submit" disabled={busy || !mine.trim()} title="Abrir conversa">
            <IconSend size={18} />
          </button>
        </div>
      </form>

      {error && <div className="error">{error}</div>}
    </div>
  );
}