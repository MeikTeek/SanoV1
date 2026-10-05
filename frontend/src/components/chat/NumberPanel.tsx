import { useCallback, useEffect, useState } from 'react';
import { getMyNumber, type MyNumber } from '../../services/chat.service';
import { IconChevron, IconCopy, IconHash } from '../ui/icons';

/** "00h 42min" / "1h 05min" a partir dos segundos restantes. */
const countdown = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}min` : `${m}min`;
};

/**
 * Cartão recolhível do "número" do usuário.
 *
 * Ele é como um telefone: você mostra o seu para a pessoa digitar. O código
 * troca sozinho a cada 15 horas — por isso a contagem regressiva quando o
 * cartão está aberto.
 *
 * Por que fica no rodapé e fechado por padrão: é informação de uso eventual,
 * não o conteúdo da tela. Quem quer conversas vê as conversas; o código está a
 * um clique. O caminho inverso (digitar o código de alguém) virou o botão
 * "Entrar com código", ao lado de "Nova".
 */
export default function NumberPanel() {
  const [number, setNumber] = useState<MyNumber | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

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
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard pode estar bloqueado: o código segue visível para ler à mão.
      setError('Não consegui copiar — o código está logo acima.');
    }
  };

  return (
    <div className={`code-card ${open ? 'open' : ''}`}>
      <button
        className="code-card-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={open ? 'Esconder meu código' : 'Mostrar meu código'}
      >
        <span className="code-card-label">
          <IconHash size={14} /> Meu código
        </span>
        {/* Fechado, o código já aparece: é o que a pessoa precisa copiar. */}
        <span className="code-card-code">{number ? number.formatted : '····-····'}</span>
        <span className="code-card-copy" role="button" tabIndex={-1} onClick={(e) => { e.stopPropagation(); void copy(); }}>
          <IconCopy size={14} /> {copied ? 'copiado' : 'copiar'}
        </span>
        <IconChevron size={16} />
      </button>

      {open && (
        <div className="code-card-body">
          <p className="code-card-exp">
            expira em <b>{number ? countdown(number.expiresInSeconds) : '—'}</b>
          </p>
          <p className="code-card-help">
            Muda a cada {number ? number.windowHours : 15}h. Quem receber consegue te
            chamar mesmo sem saber o seu usuário — e, como todo o resto, o servidor
            não vê o conteúdo da conversa.
          </p>
          {error && <div className="error">{error}</div>}
        </div>
      )}
    </div>
  );
}