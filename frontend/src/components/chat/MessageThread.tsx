import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AudioPlayer from './AudioPlayer';
import AudioRecorder, { type Recording } from './AudioRecorder';
import { Avatar } from './ConversationList';
import { updatePresence } from '../../services/chat.service';
import {
  IconBack, IconImage, IconInfo, IconKey, IconLock, IconPhone, IconSearch,
  IconSend, IconSmile, IconUsers,
} from '../ui/icons';
import type { Conversation, Message } from '../../services/chat.service';

const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/** Rótulo do separador de dia: "Hoje", "Ontem" ou a data por extenso. */
const fmtDay = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Hoje';
  const ontem = new Date(now);
  ontem.setDate(now.getDate() - 1);
  if (d.toDateString() === ontem.toDateString()) return 'Ontem';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(d);
};

/** Só o dia, para agrupar mensagens vizinhas sem considerar o horário. */
const dayKey = (iso: string) => new Date(iso).toDateString();

/** Emoji rápido: painel pequeno que escreve no campo sem roubar o foco. */
const EMOJI_SHORTCUTS: [string, string][] = [
  ['🙂', 'risonho'], ['😂', 'risada'], ['😍', 'apaixonado'], ['😅', 'sem graça'],
  ['😎', 'descolado'], ['🤔', 'pensativo'], ['😢', 'triste'], ['😡', 'bravo'],
  ['❤️', 'coração'], ['👍', 'joia'], ['👏', 'palmas'], ['🙏', 'obrigado'],
  ['🔥', 'fogo'], ['🎉', 'festa'], ['💪', 'força'], ['😴', 'sono'],
  ['✅', 'feito'], ['👀', 'olhando'], ['☕', 'café'], ['🎵', 'música'],
];

/** Distância do fim (px) em que ainda consideramos a pessoa "lendo o fim". */
const NEAR_BOTTOM = 120;

interface Props {
  conversation: Conversation;
  myId: string;
  messages: Message[];
  busy: boolean;
  onSendText: (text: string) => void;
  onSendMedia: (blob: Blob, kind: 'IMAGE' | 'AUDIO', meta?: Record<string, unknown>) => void;
  /** Abre o painel de informações da conversa (participantes, segurança). */
  onShowInfo: () => void;
}

const MAX_IMAGE_BYTES = 900_000;

/** Coluna direita: cabeçalho, histórico e caixa de escrita. */
export default function MessageThread({
  conversation, myId, messages, busy, onSendText, onSendMedia, onShowInfo,
}: Props) {
  const navigate = useNavigate();
  const logRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingPresenceTimeout = useRef<number | null>(null);
  const [draft, setDraft] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  /** Mensagens que chegaram enquanto a pessoa lia o histórico mais acima. */
  const [unseen, setUnseen] = useState(0);
  const atBottom = useRef(true);
  const lastCount = useRef(0);

  useEffect(() => {
    if (!draft.trim()) return;
    const timer = window.setTimeout(() => {
      typingPresenceTimeout.current = null;
      updatePresence('Digitando no chat').catch((e) => console.warn('Não foi possível atualizar a atividade:', e));
    }, 900);
    typingPresenceTimeout.current = timer;
    return () => window.clearTimeout(timer);
  }, [draft]);

  // Troca de conversa: volta ao estado "no fim". Declarado antes do efeito de
  // rolagem para rodar primeiro quando os dois disparam juntos.
  useLayoutEffect(() => {
    atBottom.current = true;
    lastCount.current = 0;
    setUnseen(0);
    setEmojiOpen(false);
  }, [conversation.id]);

  // Rola até o fim quando chega mensagem nova — mas só se a pessoa já estava
  // no fim (ou se a mensagem é dela). Lendo o histórico, aparece o aviso.
  useLayoutEffect(() => {
    const el = logRef.current;
    const added = messages.length - lastCount.current;
    lastCount.current = messages.length;
    if (!el || added <= 0) return;
    const mineLast = messages[messages.length - 1]?.mine;
    const firstLoad = added === messages.length;
    if (atBottom.current || mineLast || firstLoad) {
      el.scrollTo({ top: el.scrollHeight, behavior: firstLoad ? 'auto' : 'smooth' });
      setUnseen(0);
    } else {
      setUnseen((n) => n + added);
    }
  }, [messages]);

  // Clique fora do campo fecha o painel de emojis.
  useEffect(() => {
    if (!emojiOpen) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.msg-input-wrap')) setEmojiOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [emojiOpen]);

  const onScroll = () => {
    const el = logRef.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
    if (atBottom.current && unseen) setUnseen(0);
  };

  const scrollToEnd = () => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
    setUnseen(0);
  };

  const other = conversation.members.find((m) => m.id !== myId);

  const submit = () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    setEmojiOpen(false);
    updatePresence('No chat').catch((e) => console.warn('Não foi possível atualizar a atividade:', e));
    onSendText(text);
  };

  const pickImage = (file?: File) => {
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) return; // a tela avisa no aviso geral
    onSendMedia(file, 'IMAGE');
    if (fileRef.current) fileRef.current.value = '';
  };

  const onRecorded = (rec: Recording) => onSendMedia(rec.blob, 'AUDIO', { seconds: rec.seconds });

  return (
    <section className="msg-thread">
      <header className="msg-thread-head">
        <button className="icon-btn only-mobile" onClick={() => navigate('/mensagens')} aria-label="Voltar para as conversas">
          <IconBack />
        </button>

        {conversation.kind === 'GROUP' ? (
          <>
            <span className="mini-avatar group"><IconUsers size={20} /></span>
            <div className="msg-thread-title">
              <b>{conversation.title}</b>
              <small className="msg-thread-status">
                <IconLock size={11} /> {conversation.members.length} membros · criptografado
              </small>
            </div>
          </>
        ) : (
          <button
            className="msg-thread-profile"
            onClick={() => other && navigate(`/perfil/${other.username}`)}
            disabled={!other || messages.length === 0}
            title={messages.length ? 'Ver perfil e amizade' : 'Envie uma mensagem para acessar o perfil'}
          >
            <Avatar url={other?.avatarDataUrl} name={other?.displayName} username={other?.username} size={34} />
            <span className="msg-thread-title">
              <b>{conversation.title}</b>
              <small className="msg-thread-status">
                <IconLock size={11} /> {conversation.subtitle || 'criptografado'}
              </small>
            </span>
          </button>
        )}

        <div className="msg-thread-actions">
          {/* Chamada e busca ainda não existem: ficam visíveis e desabilitadas,
              para não prometer um recurso que não chegou. */}
          <button className="icon-btn" disabled title="Chamada de vídeo (em breve)" aria-label="Chamada de vídeo">
            <IconPhone size={18} />
          </button>
          <button className="icon-btn" disabled title="Buscar na conversa (em breve)" aria-label="Buscar na conversa">
            <IconSearch size={18} />
          </button>
          <button className="icon-btn" onClick={onShowInfo} title="Informações da conversa" aria-label="Informações da conversa">
            <IconInfo size={18} />
          </button>
        </div>
      </header>

      <div className="msg-log" ref={logRef} onScroll={onScroll}>
        {messages.length === 0 && (
          <div className="msg-log-empty">
            <span className="msg-log-empty-icon"><IconLock size={22} /></span>
            <b>Diga oi 👋</b>
            <p className="muted small">
              Ainda não há mensagens. O que você enviar sai cifrado do seu navegador.
            </p>
          </div>
        )}

        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
          // Agrupa mensagens seguidas da mesma pessoa no mesmo dia: o avatar e o
          // horário ficam só na última, e os cantos das bolhas se encaixam.
          const firstOfGroup = newDay || prev.senderId !== m.senderId;
          const lastOfGroup = !next || next.senderId !== m.senderId || dayKey(next.createdAt) !== dayKey(m.createdAt);
          const media = m.kind === 'IMAGE' && m.mediaUrl && !m.failed;
          return (
            <div key={m.id} className="msg-item-wrap">
              {newDay && <div className="msg-day"><span>{fmtDay(m.createdAt)}</span></div>}
              <div className={`msg-row ${m.mine ? 'mine' : ''} ${firstOfGroup ? 'first' : ''} ${lastOfGroup ? 'last' : ''}`}>
                {!m.mine && (lastOfGroup
                  ? <Avatar url={m.senderAvatar} name={m.senderName} size={28} />
                  : <span className="msg-avatar-gap" aria-hidden="true" />)}
                <div className="msg-bubble-wrap">
                  {!m.mine && conversation.kind === 'GROUP' && firstOfGroup && (
                    <span className="msg-sender">{m.senderName}</span>
                  )}
                  <div className={`msg-bubble${media ? ' media' : ''}`} title={lastOfGroup ? undefined : fmtTime(m.createdAt)}>
                    {m.failed ? (
                      <span className="msg-failed">não consegui decifrar esta mensagem</span>
                    ) : m.kind === 'TEXT' ? (
                      // Sem texto = ainda decifrando. Nunca se mostra conteúdo parcial.
                      m.text
                        ? <span>{m.text}</span>
                        : <span className="msg-decrypting">decifrando…</span>
                    ) : m.kind === 'IMAGE' ? (
                      m.mediaUrl
                        ? <img className="msg-img" src={m.mediaUrl} alt="Imagem enviada" />
                        : <span className="msg-decrypting">decifrando imagem…</span>
                    ) : m.mediaUrl ? (
                      <AudioPlayer url={m.mediaUrl} seconds={m.meta?.seconds} />
                    ) : (
                      <span className="msg-decrypting">decifrando áudio…</span>
                    )}
                  </div>
                  {lastOfGroup && <span className="msg-time">{fmtTime(m.createdAt)}</span>}
                </div>
              </div>
            </div>
          );
        })}

        {/* Enquanto cifra e salva, diz o que está acontecendo — em vez de deixar
            a mensagem presa no estado "decifrando". */}
        {busy && (
          <p className="msg-sending">
            <span className="msg-spinner" aria-hidden="true" />
            cifrando e enviando…
          </p>
        )}
      </div>

      {unseen > 0 && (
        <button className="msg-jump" onClick={scrollToEnd}>
          ↓ {unseen} {unseen === 1 ? 'nova mensagem' : 'novas mensagens'}
        </button>
      )}

      <footer className="msg-compose">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="visually-hidden"
          onChange={(e) => pickImage(e.target.files?.[0])}
        />
        <button
          className="icon-btn"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          title="Enviar imagem (criptografada)"
          aria-label="Enviar imagem"
        >
          <IconImage />
        </button>
        <AudioRecorder onRecorded={onRecorded} disabled={busy} />

        <div className="msg-input-wrap">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => {
              const value = e.target.value;
              setDraft(value);
              if (!value.trim()) {
                updatePresence('No chat').catch((err) => console.warn('Não foi possível atualizar a atividade:', err));
              }
            }}
            onBlur={() => {
              if (typingPresenceTimeout.current !== null) {
                window.clearTimeout(typingPresenceTimeout.current);
                typingPresenceTimeout.current = null;
              }
              updatePresence('No chat').catch((e) => console.warn('Não foi possível atualizar a atividade:', e));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEmojiOpen(false);
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Mensagem cifrada…"
            maxLength={4000}
            aria-label="Escrever mensagem"
          />
          {/* Emoji rápido: escreve no campo sem roubar o foco do teclado. */}
          <button
            className={`msg-emoji-toggle${emojiOpen ? ' active' : ''}`}
            onClick={() => setEmojiOpen((v) => !v)}
            aria-expanded={emojiOpen}
            aria-label="Emojis"
            title="Emojis"
          >
            <IconSmile />
          </button>
          {emojiOpen && (
            <div className="msg-emoji-pop" role="menu" aria-label="Emojis">
              {EMOJI_SHORTCUTS.map(([emoji, nome]) => (
                <button
                  key={emoji}
                  className="msg-emoji"
                  role="menuitem"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setDraft((d) => d + emoji);
                    inputRef.current?.focus();
                  }}
                  title={nome}
                  aria-label={`Inserir ${nome}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          className={`icon-btn send${draft.trim() ? ' ready' : ''}`}
          onClick={submit}
          disabled={busy || !draft.trim()}
          title="Enviar"
          aria-label="Enviar mensagem"
        >
          <IconSend />
        </button>
      </footer>
    </section>
  );
}

/** Estado vazio: nada aberto ainda — oferece os dois caminhos de entrada. */
export function ThreadEmpty({ onNew, onJoin }: { onNew: () => void; onJoin: () => void }) {
  return (
    <section className="msg-thread">
      <div className="msg-empty">
        <span className="msg-empty-orb"><IconLock size={30} /></span>
        <h3>Escolha uma conversa</h3>
        <p className="muted">Ou comece uma agora:</p>
        <div className="msg-empty-actions">
          <button className="msg-empty-btn" onClick={onNew}>
            <IconUsers size={20} />
            <span>
              <b>Nova conversa</b>
              <small className="muted">por código ou em grupo</small>
            </span>
          </button>
          <button className="msg-empty-btn" onClick={onJoin}>
            <IconKey size={20} />
            <span>
              <b>Entrar com código</b>
              <small className="muted">usando o código de 8 caracteres</small>
            </span>
          </button>
        </div>
        <p className="msg-empty-note">
          <IconLock size={12} /> As mensagens são criptografadas no seu navegador.
          O servidor transporta, mas não lê.
        </p>
      </div>
    </section>
  );
}
