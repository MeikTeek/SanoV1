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
import '../../styles/chat.css';

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
  const { messages, setMessages, setBusy, setThinking, busy, thinking } = useChat();
  const nextId = useRef(1);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [input, setInput] = useState('');

  const make = useCallback(
    (role: ChatMessage['role'], text: string, view?: ChatMessage['view']): ChatMessage =>
      ({ id: nextId.current++, role, text, at: new Date(), view }),
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
    history.push(trimmed);

    // "limpar" e local: nao vai ao servidor.
    if (/^(limpar|clear|cls)$/i.test(trimmed)) {
      setMessages(() => []);
      return;
    }

    setMessages((m) => [...m, make('user', trimmed)]);
    setBusy(true);
    // Pergunta (com "?") e o caminho mais lento: avisa que esta consultando.
    setThinking(/\?$/.test(trimmed) ? 'consultando...' : 'processando...');

    try {
      const res = await sendCommand(trimmed);
      setMessages((m) => [...m, make('sano', res.reply, res.view)]);
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
  }, [busy, history, make, navigate, setMessages, setBusy, setThinking, setUser]);

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
return (
    <div className="chat-console">
      <div className="chat-log" ref={logRef} aria-live="polite">
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            {m.role !== 'error' && (
              <span className="msg-avatar" aria-hidden="true">
                {m.role === 'user' ? (label ?? '').slice(0, 2) : 'S'}
              </span>
            )}
            <div className="msg-body">
              {m.role !== 'error' && <span className="who">{m.role === 'user' ? label : 'Sano'}</span>}
              {/* Resposta com painel: o painel manda, o texto fica como apoio. */}
              {m.view ? (
                <ViewRenderer view={m.view} onCommand={(c) => void send(c)} />
              ) : (
                <div className="bubble">{m.text}</div>
              )}
              {m.at && <div className="time">{hhmm(m.at)}</div>}
            </div>
          </div>
        ))}

        {busy && (
          <div className="msg sano">
            <span className="msg-avatar" aria-hidden="true">S</span>
            <div className="msg-body">
              <span className="who">Sano</span>
              <div className="bubble">
                <span className="typing" role="status" aria-label={thinking}><i /><i /><i /></span>
              </div>
            </div>
          </div>
        )}
      </div>

      <form className="chat-input" onSubmit={submit}>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Fale com o Sano"
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
