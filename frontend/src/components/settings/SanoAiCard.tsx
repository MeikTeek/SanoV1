import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  fetchAiQuota, fetchAiStatus, fetchModels, removeAi, saveAi, testAi,
  type AiModel, type AiQuota, type AiStatus,
} from '../../services/sano.service';
import { loadLocalAi, localAiActive, saveLocalAi } from '../../ai/localAi';
import LocalAiPanel from './LocalAiPanel';
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
  const [models, setModels] = useState<AiModel[]>([]);
  const [provider, setProvider] = useState<'openrouter' | 'local'>(() => (localAiActive() ? 'local' : 'openrouter'));
  const [localOn, setLocalOn] = useState(localAiActive);

  /** Trocar de aba troca o provedor deste aparelho (o LM Studio liga ao conectar). */
  const pickProvider = (next: 'openrouter' | 'local') => {
    setProvider(next);
    const local = loadLocalAi();
    const enabled = next === 'local' && Boolean(local.model);
    if (local.enabled !== enabled) saveLocalAi({ ...local, enabled });
    setLocalOn(enabled);
  };
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
        void fetchModels().then((r) => setModels(r.models)).catch(() => undefined);
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
      void fetchModels().then((r) => setModels(r.models)).catch(() => undefined);
    });
  };

  const changeModel = (model: string) => void run(async () => {
    setStatus(await saveAi({ model }));
    setOk('Modelo trocado.');
  });

  const test = () => void run(async () => {
    const r = await testAi();
    if (r.ok) setOk(`${r.message} Modelo usado: ${r.model}.`);
    else setError(r.message);
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

  return (
    <section className="card ai-card" id="ia">
      <h2>Inteligência artificial e voz</h2>
      <p className="muted">
        Com a IA ligada, o Sano entende pedidos escritos do seu jeito, conversa e responde perguntas gerais.
        Sem ela, ele continua funcionando com os comandos de sempre.
      </p>

      <div className="ai-tabs" role="tablist" aria-label="Onde a IA roda">
        <button type="button" role="tab" aria-selected={provider === 'openrouter'} className={provider === 'openrouter' ? 'on' : ''} onClick={() => pickProvider('openrouter')}>
          OpenRouter <small>nuvem</small>{!localOn && status?.configured && <i className="ai-dot" aria-label="em uso" />}
        </button>
        <button type="button" role="tab" aria-selected={provider === 'local'} className={provider === 'local' ? 'on' : ''} onClick={() => pickProvider('local')}>
          LM Studio <small>neste computador</small>{localOn && <i className="ai-dot" aria-label="em uso" />}
        </button>
      </div>
      <p className="muted small ai-using">
        A aba escolhida é a IA que o chat usa <b>neste aparelho</b>.
      </p>

      {provider === 'local' ? <LocalAiPanel onChange={setLocalOn} /> : status?.configured ? (
        <div className="ai-on">
          <div className="ai-row">
            <span><span className="ai-dot" aria-hidden="true" /> IA ligada · chave <code>{status.keyHint}</code></span>
            <span className="ai-actions">
              <button type="button" className="ghost" disabled={busy} onClick={test}>Testar IA</button>
              <button type="button" className="ghost" disabled={busy} onClick={remove}>Remover chave</button>
            </span>
          </div>
          {quota?.freeDaily && (
            <p className="muted small">
              Hoje: {quota.freeDaily.used} de {quota.freeDaily.limit} perguntas gratuitas usadas.
            </p>
          )}
          <ModelPicker current={status.model} models={models} busy={busy} onPick={changeModel} />
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
            {canUseMic()
              ? 'Toque no microfone do chat e fale. O Sano entende português e responde em voz alta. Em navegadores sem o reconhecimento do Google (Brave, Opera, app Android), a fala é transcrita como você escolher abaixo.'
              : 'Este navegador não consegue usar o microfone, mas o Sano ainda pode ler as respostas.'}
          </p>
          {canUseMic() && (
            <label className="ai-field">
              <span>Quem transcreve a sua fala (quando o navegador não consegue)</span>
              <select value={prefs.stt} onChange={(e) => updatePrefs({ stt: e.target.value as VoicePrefs['stt'] })}>
                <option value="local">Este computador — Whisper, grátis e privado</option>
                <option value="openrouter">OpenRouter — mais leve, bom para celular</option>
              </select>
              <small className="muted">
                {prefs.stt === 'local'
                  ? 'Na primeira vez baixa o modelo de voz, que fica guardado. O áudio não sai do aparelho.'
                  : 'Precisa de uma chave da OpenRouter. O áudio vai para um modelo gratuito de lá.'}
              </small>
            </label>
          )}
          {canUseMic() && prefs.stt === 'local' && (
            <label className="ai-field">
              <span>Precisão do reconhecimento</span>
              <select value={prefs.whisper} onChange={(e) => updatePrefs({ whisper: e.target.value as VoicePrefs['whisper'] })}>
                <option value="auto">Automática — a precisa se houver placa de vídeo</option>
                <option value="precise">Precisa — entende melhor com ruído e fala rápida</option>
                <option value="fast">Leve — menor e mais rápida em PCs fracos</option>
              </select>
              <small className="muted">
                {prefs.whisper === 'fast'
                  ? 'Whisper base: cerca de 77 MB e 3 segundos por frase, mas erra bastante com barulho ou fala corrida.'
                  : prefs.whisper === 'precise'
                    ? 'Whisper small: de 250 a 410 MB. Com placa de vídeo leva uns 2 segundos por frase; só no processador, perto de 10.'
                    : 'Com placa de vídeo usa o Whisper small (cerca de 410 MB, uns 2 segundos por frase); sem ela, o leve.'}
              </small>
            </label>
          )}
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

const price = (m: AiModel) => (m.free ? 'grátis' : `US$ ${m.pricePrompt.toFixed(2)} / ${m.priceCompletion.toFixed(2)} por 1M tokens`);

/**
 * Escolha livre de modelo: busca na lista inteira da OpenRouter (gratuitos e
 * pagos) ou qualquer ID digitado à mão.
 */
function ModelPicker({ current, models, busy, onPick }: { current: string; models: AiModel[]; busy: boolean; onPick: (id: string) => void }) {
  const [value, setValue] = useState(current);
  const [onlyFree, setOnlyFree] = useState(true);
  useEffect(() => setValue(current), [current]);

  const shown = useMemo(() => models.filter((m) => !onlyFree || m.free), [models, onlyFree]);
  const picked = models.find((m) => m.id === value.trim());
  const active = models.find((m) => m.id === current);
  const changed = value.trim() && value.trim() !== current;

  return (
    <div className="ai-field">
      <span>Modelo</span>
      <div className="ai-key-form">
        <input
          list="sano-or-models"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Busque pelo nome ou cole o ID (ex.: openai/gpt-5-mini)"
          spellCheck={false}
          aria-label="Modelo da OpenRouter"
        />
        <button type="button" disabled={busy || !changed} onClick={() => onPick(value.trim())}>Usar</button>
      </div>
      <datalist id="sano-or-models">
        {shown.map((m) => <option key={m.id} value={m.id}>{`${m.name} · ${price(m)}`}</option>)}
      </datalist>
      <label className="ai-inline">
        <input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} /> Mostrar só os gratuitos
      </label>
      <small className="muted">
        Em uso: <b>{active?.name ?? current}</b>{active ? ` (${price(active)})` : ''}.
        {changed && picked && !picked.free && <> <b className="warn-text">Esse modelo é pago</b>: gasta créditos da sua conta OpenRouter ({price(picked)}).</>}
        {changed && !picked && models.length > 0 && <> Esse ID não está na lista, mas você pode usar mesmo assim — se não existir, o <b>Testar IA</b> avisa.</>}
        {' '}"Automático" escolhe sozinho um modelo gratuito — é o mais fácil.
      </small>
    </div>
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
