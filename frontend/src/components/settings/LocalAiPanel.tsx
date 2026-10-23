import { useState } from 'react';
import { listLocalModels, loadLocalAi, runLocalAi, saveLocalAi, type LocalAiPrefs } from '../../ai/localAi';

/**
 * IA local pelo LM Studio. Tudo aqui fica no navegador deste aparelho: o
 * servidor do Sano nunca vê o endereço nem o token do LM Studio.
 */
export default function LocalAiPanel({ onChange }: { onChange?: (active: boolean) => void }) {
  const [prefs, setPrefs] = useState<LocalAiPrefs>(loadLocalAi);
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const update = (patch: Partial<LocalAiPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    saveLocalAi(next);
    onChange?.(next.enabled && Boolean(next.model));
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(''); setOk('');
    try { await fn(); } catch (e) { setError(`Falhou: ${(e as Error).message}.`); } finally { setBusy(false); }
  };

  const connect = () => void run(async () => {
    const list = await listLocalModels(prefs);
    setModels(list);
    if (!list.length) { setError('Conectei, mas o LM Studio não tem nenhum modelo de conversa baixado.'); return; }
    const model = prefs.model && list.includes(prefs.model) ? prefs.model : list[0];
    update({ model, enabled: true });
    setOk(`Conectado! O chat deste aparelho agora usa o LM Studio (${model}).`);
  });

  const test = () => void run(async () => {
    const t = Date.now();
    const answer = await runLocalAi(prefs, [{ role: 'user', content: 'Responda apenas: ok' }]);
    setOk(`O modelo respondeu "${answer.slice(0, 60)}" em ${((Date.now() - t) / 1000).toFixed(1)} s.`);
  });

  return (
    <div className="ai-local">
      <p className={prefs.enabled && prefs.model ? 'notice small' : 'muted small'}>
        {prefs.enabled && prefs.model
          ? <>Em uso neste aparelho: <b>{prefs.model}</b>. Nos outros aparelhos nada muda.</>
          : 'Clique em Conectar para o chat deste aparelho passar a usar o LM Studio.'}
      </p>

      <label className="ai-field">
        <span>Endereço do servidor</span>
        <input
          value={prefs.baseUrl}
          onChange={(e) => update({ baseUrl: e.target.value })}
          placeholder="http://localhost:1234/v1"
          spellCheck={false}
          autoComplete="off"
        />
      </label>
      <label className="ai-field">
        <span>Token de acesso <small className="muted">(só se ativou "Require API key" no LM Studio)</small></span>
        <input
          type="password"
          value={prefs.apiKey}
          onChange={(e) => update({ apiKey: e.target.value })}
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      <div className="ai-actions">
        <button type="button" disabled={busy || !prefs.baseUrl.trim()} onClick={connect}>Conectar</button>
        <button type="button" className="ghost" disabled={busy || !prefs.model} onClick={test}>Testar modelo</button>
      </div>

      <label className="ai-field">
        <span>Modelo</span>
        <input
          list="sano-local-models"
          value={prefs.model}
          onChange={(e) => update({ model: e.target.value.trim(), enabled: Boolean(e.target.value.trim()) })}
          placeholder={models.length ? 'Escolha ou digite o nome' : 'Clique em Conectar para listar'}
          spellCheck={false}
        />
        <datalist id="sano-local-models">
          {models.map((m) => <option key={m} value={m} />)}
        </datalist>
        <small className="muted">Qualquer modelo baixado no LM Studio. Se não estiver carregado, ele carrega na primeira pergunta (pode demorar).</small>
      </label>

      {error && <p className="error">{error}</p>}
      {ok && <p className="notice">{ok}</p>}

      <details className="ai-help">
        <summary>Como ligar o LM Studio (uma vez só)</summary>
        <ol className="ai-steps">
          <li>Instale o <a href="https://lmstudio.ai" target="_blank" rel="noreferrer">LM Studio</a> e baixe um modelo na aba de busca (ex.: <i>Qwen</i>, <i>Llama</i> ou <i>Gemma</i>; os de 4B a 8B rodam bem na maioria dos PCs).</li>
          <li>Abra a aba <b>Developer</b> (ícone de terminal, à esquerda) e ligue o servidor em <b>Status: Running</b>.</li>
          <li>Em <b>Settings</b> do servidor, ative <b>Enable CORS</b>. Sem isso o navegador não consegue falar com ele.</li>
          <li>Volte aqui e clique em <b>Conectar</b>. Pronto: o chat deste aparelho passa a usar o LM Studio. Para voltar à OpenRouter, é só clicar na aba dela.</li>
          <li>Se o navegador perguntar se o site pode acessar dispositivos da rede local, toque em <b>Permitir</b>.</li>
        </ol>
        <ul className="ai-notes muted small">
          <li>Funciona no computador onde o LM Studio está rodando, no Chrome, Edge ou Firefox. O Safari bloqueia.</li>
          <li>Tudo roda no seu PC: as conversas não vão para nenhuma empresa de IA, só a frase final passa pelo Sano.</li>
          <li>O microfone de reserva (quando o navegador não reconhece fala) continua usando a OpenRouter.</li>
        </ul>
      </details>
    </div>
  );
}
