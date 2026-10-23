import { useEffect, useState, type FormEvent } from 'react';
import {
  fetchAiQuota, fetchAiStatus, fetchFreeModels, removeAi, saveAi,
  type AiQuota, type AiStatus, type FreeModel,
} from '../../services/sano.service';
import {
  canListen, canSpeak, canUseMic, fetchNeuralVoices, loadVoicePrefs, portugueseVoices, saveVoicePrefs, speak,
  type NeuralVoice, type VoicePrefs,
} from '../../voice/voice';

/**
 * IA e voz do Sano.
 *
 * Cada pessoa traz a própria chave da OpenRouter (os modelos gratuitos não
 * custam nada). Sem chave, o Sano funciona do mesmo jeito, só sem conversa
 * livre. A voz neural vem da Microsoft (grátis); as preferências valem só
 * para este aparelho.
 */
export default function SanoAiCard() {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [quota, setQuota] = useState<AiQuota | null>(null);
  const [models, setModels] = useState<FreeModel[]>([]);
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState<VoicePrefs>(loadVoicePrefs);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [neural, setNeural] = useState<NeuralVoice[]>([]);

  useEffect(() => {
    fetchNeuralVoices().then((r) => setNeural(r.voices)).catch(() => undefined);
  }, []);

  useEffect(() => {
    fetchAiStatus().then((s) => {
      setStatus(s);
      if (s.configured) {
        void fetchAiQuota().then((r) => setQuota(r.quota)).catch(() => undefined);
        void fetchFreeModels().then((r) => setModels(r.models)).catch(() => undefined);
      }
    }).catch((e: Error) => setError(e.message));
  }, []);

  // As vozes do navegador chegam depois do carregamento da página.
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const load = () => setVoices(portugueseVoices());
    load();
    speechSynthesis.addEventListener('voiceschanged', load);
    return () => speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(''); setOk('');
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const submitKey = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const res = await saveAi({ apiKey: key.trim() });
      setStatus(res);
      setQuota(res.quota ?? null);
      setKey('');
      setOk('Pronto! O Sano agora conversa com IA. Experimente perguntar qualquer coisa no chat.');
      void fetchFreeModels().then((r) => setModels(r.models)).catch(() => undefined);
    });
  };

  const changeModel = (model: string) => void run(async () => {
    setStatus(await saveAi({ model }));
    setOk('Modelo trocado.');
  });

  const remove = () => void run(async () => {
    setStatus(await removeAi());
    setQuota(null);
    setOk('Chave removida. O Sano voltou ao modo sem IA.');
  });

  const updatePrefs = (patch: Partial<VoicePrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    saveVoicePrefs(next);
  };

  const modelOptions = models.length ? models : status ? [{ id: status.model, name: status.model, context: 0 }] : [];

  return (
    <section className="card ai-card" id="ia">
      <h2>Inteligência artificial e voz</h2>
      <p className="muted">
        Com a IA ligada, o Sano entende pedidos escritos do seu jeito, conversa e responde perguntas gerais.
        Sem ela, ele continua funcionando com os comandos de sempre.
      </p>

      {status?.configured ? (
        <div className="ai-on">
          <div className="ai-row">
            <span><span className="ai-dot" aria-hidden="true" /> IA ligada · chave <code>{status.keyHint}</code></span>
            <button type="button" className="ghost" disabled={busy} onClick={remove}>Remover chave</button>
          </div>
          {quota?.freeDaily && (
            <p className="muted small">
              Hoje: {quota.freeDaily.used} de {quota.freeDaily.limit} perguntas gratuitas usadas.
            </p>
          )}
          <label className="ai-field">
            <span>Modelo</span>
            <select value={status.model} disabled={busy} onChange={(e) => changeModel(e.target.value)}>
              {modelOptions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <small className="muted">"Automático" escolhe sozinho um modelo gratuito disponível — é o mais fácil.</small>
          </label>
          <details className="ai-help">
            <summary>Trocar a chave</summary>
            <KeyForm value={key} onChange={setKey} onSubmit={submitKey} busy={busy} label="Salvar nova chave" />
          </details>
        </div>
      ) : (
        <>
          <KeyForm value={key} onChange={setKey} onSubmit={submitKey} busy={busy || !status} label="Ligar IA" />
          <Tutorial open={status ? !status.configured : false} />
        </>
      )}

      {error && <p className="error">{error}</p>}
      {ok && <p className="notice">{ok}</p>}

      <h3 className="ai-sub">Voz</h3>
      {!canSpeak() && !canUseMic() ? (
        <p className="muted small">Este navegador não tem voz. No computador, use o Chrome ou o Edge.</p>
      ) : (
        <>
          <p className="muted small">
            {canListen()
              ? 'Toque no microfone do chat e fale. O Sano entende português e responde em voz alta. Em navegadores sem o reconhecimento do Google (Brave, Opera, app Android), a fala é transcrita pela sua IA.'
              : canUseMic()
                ? 'Toque no microfone do chat e fale. Neste navegador a fala é transcrita pela sua IA, então ligue-a acima para usar o microfone.'
                : 'Este navegador não consegue usar o microfone, mas o Sano ainda pode ler as respostas.'}
          </p>
          <label className="ai-field">
            <span>Ler respostas em voz alta</span>
            <select value={prefs.speak} onChange={(e) => updatePrefs({ speak: e.target.value as VoicePrefs['speak'] })}>
              <option value="voice">Só quando eu falar pelo microfone</option>
              <option value="always">Sempre</option>
              <option value="never">Nunca</option>
            </select>
          </label>
          <label className="ai-field">
            <span>Tipo de voz</span>
            <select value={prefs.engine} onChange={(e) => updatePrefs({ engine: e.target.value as VoicePrefs['engine'] })}>
              <option value="neural">Neural da Microsoft — natural, precisa de internet</option>
              <option value="browser">Do aparelho — mais robótica, funciona offline</option>
            </select>
          </label>
          {prefs.engine === 'neural' && neural.length > 0 && (
            <label className="ai-field">
              <span>Voz do Sano</span>
              <select value={prefs.neuralVoice} onChange={(e) => updatePrefs({ neuralVoice: e.target.value })}>
                {neural.map((v) => (
                  <option key={v.id} value={v.id}>{v.name} ({v.gender === 'Male' ? 'masculina' : 'feminina'})</option>
                ))}
              </select>
            </label>
          )}
          {prefs.engine === 'browser' && voices.length > 0 && (
            <label className="ai-field">
              <span>Voz do Sano</span>
              <select value={prefs.voiceURI} onChange={(e) => updatePrefs({ voiceURI: e.target.value })}>
                <option value="">Automática (a melhor em português)</option>
                {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)}
              </select>
            </label>
          )}
          <label className="ai-field">
            <span>Velocidade · {prefs.rate.toFixed(2)}×</span>
            <input type="range" min={0.7} max={1.5} step={0.05} value={prefs.rate} onChange={(e) => updatePrefs({ rate: Number(e.target.value) })} />
          </label>
          <label className="ai-field">
            <span>Tom · {prefs.pitch.toFixed(2)}</span>
            <input type="range" min={0.5} max={1.5} step={0.05} value={prefs.pitch} onChange={(e) => updatePrefs({ pitch: Number(e.target.value) })} />
          </label>
          <button type="button" className="ghost" onClick={() => speak('Às suas ordens. Sistemas online e prontos.', prefs)}>
            Ouvir exemplo
          </button>
        </>
      )}
    </section>
  );
}

function KeyForm(props: { value: string; onChange: (v: string) => void; onSubmit: (e: FormEvent) => void; busy: boolean; label: string }) {
  return (
    <form className="ai-key-form" onSubmit={props.onSubmit}>
      <input
        type="password"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder="Cole aqui sua chave: sk-or-v1-…"
        autoComplete="off"
        spellCheck={false}
        aria-label="Chave da OpenRouter"
      />
      <button type="submit" disabled={props.busy || !props.value.trim()}>{props.label}</button>
    </form>
  );
}

/** Passo a passo para quem nunca mexeu com "API key". */
function Tutorial({ open }: { open: boolean }) {
  return (
    <details className="ai-help" open={open}>
      <summary>Como conseguir sua chave grátis (5 minutos)</summary>
      <ol className="ai-steps">
        <li>
          Abra <a href="https://openrouter.ai" target="_blank" rel="noreferrer">openrouter.ai</a> e clique em <b>Sign up</b> (ou <b>Sign in</b>).
          Dá para entrar direto com sua conta Google. <b>Não precisa de cartão.</b>
        </li>
        <li>
          Já logado, abra a página de chaves:{' '}
          <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer">openrouter.ai/settings/keys</a>{' '}
          (ou clique na sua foto, no canto de cima, e depois em <b>Keys</b>).
        </li>
        <li>
          Clique em <b>Create API Key</b>. No nome, escreva <i>Sano</i>. Se aparecer um campo de limite de crédito,
          pode deixar em branco — os modelos gratuitos não cobram nada.
        </li>
        <li>
          Vai aparecer um código longo que começa com <code>sk-or-v1-</code>. Clique em copiar.
          <b> Ele só aparece uma vez</b> — se perder, é só criar outro.
        </li>
        <li>Volte aqui, cole no campo acima e toque em <b>Ligar IA</b>. Pronto!</li>
      </ol>
      <ul className="ai-notes muted small">
        <li>A conta grátis dá cerca de <b>50 perguntas à IA por dia</b>. Os comandos normais do Sano (agenda, finanças, treino) não gastam nada.</li>
        <li>
          Se o Sano avisar sobre "privacidade", abra{' '}
          <a href="https://openrouter.ai/settings/privacy" target="_blank" rel="noreferrer">openrouter.ai/settings/privacy</a>{' '}
          e permita os modelos gratuitos.
        </li>
        <li>Sua chave fica guardada criptografada e nunca é mostrada de novo. Você pode removê-la aqui ou apagá-la no site da OpenRouter quando quiser.</li>
        <li>Não mande dados sensíveis (senhas, documentos) para a IA: os modelos gratuitos podem guardar as conversas.</li>
      </ul>
    </details>
  );
}
