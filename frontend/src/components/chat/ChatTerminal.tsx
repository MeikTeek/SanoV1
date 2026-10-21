import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../store/chatStore';
import { ApiError } from '../../services/api';
import { sendCommand, fetchGreeting } from '../../services/sano.service';
import { useCommandHistory } from '../../hooks/useCommandHistory';
import type { ChatMessage } from '../../types/sano';
import { IconSend } from '../ui/icons';
import ViewRenderer from './ViewRenderer';
import { useMusic } from '../../music/musicStore';
import '../../styles/chat.css';

/** Cartões que ficam melhores acompanhados da frase do Sano. */
const WITH_TEXT = new Set(['event', 'agenda', 'confirmation']);

const STARTERS = ['o que tenho hoje?', 'qual meu próximo compromisso?', 'tô livre amanhã à tarde?', 'resumo financeiro'];

const PLACEHOLDERS = [
  'Fale com o Sano — ex.: "marca dentista sexta às 15h"',
  'Ex.: "me lembra de ligar pra minha mãe às 19h"',
  'Ex.: "o que tenho essa semana?"',
  'Ex.: "adia a reunião em 30 minutos"',
  'Ex.: "academia toda segunda às 7h"',
  'Ex.: "gastei 45,90 no mercado"',
];

const hhmm = (d: Date) => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(d);

/**
 * Console do Sano: campo de entrada + histórico em bolhas.
 *
 * A tela em si é montada pelo DashboardPage (orbe no centro, painéis laterais);
 * aqui fica só o que é conversa. O estado vive no `chatStore`, então navegar
 * para Agenda e voltar não apaga o histórico.
 */
export default function ChatTerminal() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const history = useCommandHistory();
  const { messages, setMessages, setBusy, setComposing, setThinking, busy, thinking, refreshPanels } = useChat();
  const { tracks, playlists, volume, playing, play, toggle, setVolume } = useMusic();
  const nextId = useRef(1);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [input, setInput] = useState('');
  // Exemplo diferente a cada mensagem: ensina o que dá para pedir sem precisar de "ajuda".
  const placeholder = messages.length % PLACEHOLDERS.length;

  const make = useCallback(
    (role: ChatMessage['role'], text: string, view?: ChatMessage['view'], suggestions?: string[]): ChatMessage =>
      ({ id: nextId.current++, role, text, at: new Date(), view, suggestions }),
    [],
  );

  /** Saudacao so quando nao existe conversa salva - nunca duplica a cada montagem. */
  useEffect(() => {
    if (messages.length) return;
    let alive = true;
    fetchGreeting()
      .then(({ greeting }) => { if (alive) setMessages((m) => [...m, make('sano', greeting)]); })
      .catch(() => { if (alive) setMessages((m) => [...m, make('sano', `Ola, ${user?.username}. Comece por "ajuda".`)]); });
    return () => { alive = false; };
    // Monta uma vez: recriaria a lista a cada tecla digitada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, busy]);

  /** Envia ao Sano. Usado pelo formulario e pelos botoes clicaveis dos paineis. */
  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    setInput('');
    setComposing(false);
    history.push(trimmed);

    // "limpar" e local: nao vai ao servidor.
    if (/^(limpar|clear|cls)$/i.test(trimmed)) {
      setMessages(() => []);
      return;
    }

    setMessages((m) => [...m, make('user', trimmed)]);

    const normalized = trimmed.toLocaleLowerCase();
    if (/^(?:sano[,:]?\s*)?(?:pausar|pause|pausa)(?:\s+m[uú]sica)?$/i.test(trimmed)) {
      if (playing) toggle();
      setMessages((m) => [...m, make('sano', playing ? 'Música pausada.' : 'A música já está pausada.')]);
      setBusy(false);
      inputRef.current?.focus();
      return;
    }
    const volumeRequest = normalized.match(/^(?:sano[,:]?\s*)?(aumentar|diminuir|baixar|subir)\s+(?:o\s+)?volume$/i);
    if (volumeRequest) {
      const amount = volumeRequest[1] === 'aumentar' || volumeRequest[1] === 'subir' ? 0.1 : -0.1;
      setVolume(Math.max(0, Math.min(1, Math.round((volume + amount) * 100) / 100)));
      setMessages((m) => [...m, make('sano', `Volume ${amount > 0 ? 'aumentado' : 'diminuído'}.`)]);
      setBusy(false);
      inputRef.current?.focus();
      return;
    }
    const defaultTracks = tracks.filter((track) => !playlists.some((playlist) => playlist.trackIds.includes(track.id)));
    const defaultRequest = /^(?:sano[,:]?\s*)?(?:tocar|toque|reproduzir|reproduza)\s+(?:a\s+)?(?:playlist\s+)?(?:default|padr[aã]o|m[uú]sicas?)$/i.test(trimmed);
    const favoritesRequest = /^(?:sano[,:]?\s*)?(?:tocar|toque|reproduzir|reproduza)\s+(?:as?\s+)?favoritas?$/i.test(trimmed);
    if (defaultRequest || favoritesRequest) {
      const selected = favoritesRequest ? tracks.filter((track) => track.favorite) : defaultTracks;
      if (selected.length) {
        play(selected[0], selected.slice(1));
        setMessages((m) => [...m, make('sano', favoritesRequest ? 'Tocando suas músicas favoritas.' : 'Tocando a playlist Músicas.')]);
      } else {
        setMessages((m) => [...m, make('sano', favoritesRequest ? 'Você ainda não marcou músicas como favoritas.' : 'Sua playlist Músicas está vazia.')]);
      }
      setBusy(false);
      inputRef.current?.focus();
      return;
    }
    const musicRequest = trimmed.match(/^(?:sano[,:]?\s*)?(?:tocar|toque|reproduzir|reproduza)\s+(?:a\s+)?(?:m[uú]sica\s+|playlist\s+|autor\s+)?(.+)$/i);
    if (musicRequest) {
      const term = musicRequest[1].trim().toLocaleLowerCase();
      const matches = tracks.filter((track) => `${track.title} ${track.artist} ${track.album}`.toLocaleLowerCase().includes(term));
      if (matches.length) {
        play(matches[0], matches.slice(1));
        setMessages((m) => [...m, make('sano', `Tocando "${matches[0].title}" de ${matches[0].artist}.`)]);
      } else {
        setMessages((m) => [...m, make('sano', `Não encontrei "${musicRequest[1].trim()}" na sua biblioteca. Abra Música para adicionar arquivos.`)]);
      }
      setBusy(false);
      inputRef.current?.focus();
      return;
    }

    setBusy(true);
    // Pergunta (com "?") e o caminho mais lento: avisa que esta consultando.
    setThinking(/\?$/.test(trimmed) ? 'consultando...' : 'processando...');

    try {
      const res = await sendCommand(trimmed);
      setMessages((m) => [...m, make('sano', res.reply, res.view, res.suggestions)]);
      // Mexeu na agenda pelo chat: os painéis "Hoje" precisam refletir na hora.
      if (res.intent === 'agenda' || res.intent === 'financas') refreshPanels();
      res.actions?.forEach((a) => {
        if (a.type === 'navigate') setTimeout(() => navigate(a.to), 600);
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { setUser(null); return; }
      setMessages((m) => [...m, make('error', err instanceof Error ? err.message : 'Falha ao falar com o servidor')]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }, [busy, history, make, navigate, playing, playlists, play, refreshPanels, setMessages, setBusy, setComposing, setThinking, setUser, setVolume, toggle, tracks, volume]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      const v = history.prev();
      if (v !== null) { e.preventDefault(); setInput(v); }
    } else if (e.key === 'ArrowDown') {
      const v = history.next();
      if (v !== null) { e.preventDefault(); setInput(v); }
    }
  };

  const submit = (e: FormEvent) => { e.preventDefault(); void send(input); };
  const label = user?.displayName || user?.username;
  const lastSano = [...messages].reverse().find((m) => m.role !== 'user');
  // Conversa recém-aberta: o Sano oferece por onde começar.
  const fresh = messages.filter((m) => m.role === 'user').length === 0;
  const chips = busy ? [] : fresh ? STARTERS : lastSano?.suggestions ?? [];
return (
    <div className="chat-console">
      <div className="chat-log" ref={logRef} aria-live="polite">
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            {m.role !== 'error' && (
              m.role === 'user'
                ? <span className="msg-avatar" aria-hidden="true">{(label ?? '').slice(0, 2)}</span>
                : <img className="msg-avatar sano-avatar-img" src="/sano-avatar.png" alt="" />
            )}
            <div className="msg-body">
              {m.role !== 'error' && <span className="who">{m.role === 'user' ? label : 'Sano'}</span>}
              {/* Resposta com painel: o painel manda, o texto fica como apoio. */}
              {/* Cartões curtos (evento, agenda, confirmação) vêm com a frase do Sano junto;
                  painéis densos (medidores, ajuda) substituem o texto. */}
              {(!m.view || WITH_TEXT.has(m.view.kind)) && <div className="bubble">{m.text}</div>}
              {m.view && <ViewRenderer view={m.view} onCommand={(c) => void send(c)} />}
              {m.at && <div className="time">{hhmm(m.at)}</div>}
            </div>
          </div>
        ))}

        {busy && (
          <div className="msg sano">
            <img className="msg-avatar sano-avatar-img" src="/sano-avatar.png" alt="" />
            <div className="msg-body">
              <span className="who">Sano</span>
              <div className="bubble">
                <span className="typing" role="status" aria-label={thinking}><i /><i /><i /></span>
              </div>
            </div>
          </div>
        )}
      </div>

      {chips.length > 0 && (
        <div className="chat-chips" aria-label="Sugestões">
          {chips.map((c) => (
            <button key={c} type="button" className="hud-chip" onClick={() => void send(c)}>{c}</button>
          ))}
        </div>
      )}

      <form className="chat-input" onSubmit={submit}>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setComposing(Boolean(e.target.value.trim()));
          }}
          onKeyDown={onKeyDown}
          placeholder={PLACEHOLDERS[placeholder]}
          maxLength={500}
          autoComplete="off"
          spellCheck={false}
          aria-label="Mensagem para o Sano"
        />
        <button className="icon-btn" type="submit" disabled={busy || !input.trim()} aria-label="Enviar">
          <IconSend />
        </button>
      </form>
    </div>
  );
}
