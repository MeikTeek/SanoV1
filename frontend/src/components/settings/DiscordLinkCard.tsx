import { useEffect, useState } from 'react';
import { api } from '../../services/api';

interface Status { linked: boolean; discordUsername?: string | null; linkedAt?: string }

/**
 * Vínculo com o SanoBot: gera um código de uso único que o usuário digita em
 * `/vincular` no Discord. Sem o vínculo, o bot não acessa nada.
 */
export default function DiscordLinkCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.get<Status>('/integrations/discord').then(setStatus).catch((e: Error) => setError(e.message));
  useEffect(() => { void load(); }, []);

  // Enquanto o código está na tela, confere se o vínculo já aconteceu.
  useEffect(() => {
    if (!code) return;
    const timer = setInterval(() => {
      void api.get<Status>('/integrations/discord').then((s) => {
        setStatus(s);
        if (s.linked) setCode(null);
      }).catch(() => undefined);
      if (new Date(code.expiresAt) < new Date()) setCode(null);
    }, 4000);
    return () => clearInterval(timer);
  }, [code]);

  const generate = async () => {
    setBusy(true); setError('');
    try { setCode(await api.post<{ code: string; expiresAt: string }>('/integrations/discord/link-code')); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const unlink = async () => {
    setBusy(true); setError('');
    try { await api.delete('/integrations/discord/link'); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <section className="card discord-card">
      <h2>Discord</h2>
      <p className="muted">
        Use sua agenda pelo SanoBot: comandos como <code>/agenda marca dentista sexta às 15h</code>, mensagens diretas
        para o bot e lembretes por DM.
      </p>
      {status?.linked ? (
        <div className="discord-linked">
          <span>Vinculado{status.discordUsername ? <> a <strong>@{status.discordUsername}</strong></> : null}.</span>
          <button type="button" className="ghost" disabled={busy} onClick={() => void unlink()}>Desvincular</button>
        </div>
      ) : code ? (
        <div className="discord-code">
          <span>No Discord, envie:</span>
          <code className="discord-code-value">/vincular codigo:{code.code}</code>
          <small className="muted">Vale por 10 minutos e só uma vez. Esta tela atualiza sozinha quando o vínculo acontecer.</small>
        </div>
      ) : (
        <button type="button" disabled={busy || !status} onClick={() => void generate()}>Gerar código de vínculo</button>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
