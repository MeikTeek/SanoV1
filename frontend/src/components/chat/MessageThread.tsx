import { useEffect, useRef, useState } from 'react';
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

/** Emoji rápido: escreve direto no campo, sem painel sobreposto. */
const EMOJI_SHORTCUTS: [string, string][] = [
  ['🙂', 'risonho'], ['😂', 'risada'], ['❤️', 'coração'], ['👍', 'joia'],
  ['🔥', 'fogo'], ['😴', 'sono'], ['🙏', 'obrigado'], ['💪', 'força'],
];

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

  useEffect(() => {
    if (!draft.trim()) return;
    const timer = window.setTimeout(() => {
      typingPresenceTimeout.current = null;
      updatePresence('Digitando no chat').catch((e) => console.warn('Não foi possível atualizar a atividade:', e));
    }, 900);
    typingPresenceTimeout.current = timer;
    return () => window.clearTimeout(timer);
  }, [draft]);

  // Rola até o fim quando chega mensagem nova.
  if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;

  const other = conversation.members.find((m) => m.id !== myId);

  const submit = () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
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

      <div className="msg-log" ref={logRef}>
        {messages.length === 0 && (
          <p className="muted small pad center-txt">
            Ainda não há mensagens. O que você enviar sai cifrado do seu navegador.
          </p>
        )}

        {messages.map((m, i) => {
          const prev = messages[i - 1];
          // Agrupa mensagens seguidas da mesma pessoa (evita repetir o avatar).
          const firstOfGroup = !prev || prev.senderId !== m.senderId;
          const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
          return (
            <div key={m.id}>
              {newDay && <div className="msg-day"><span>{fmtDay(m.createdAt)}</span></div>}
              <div className={`msg-row ${m.mine ? 'mine' : ''} ${firstOfGroup ? 'first' : ''}`}>
                {!m.mine && firstOfGroup && <Avatar url={m.senderAvatar} name={m.senderName} size={28} />}
                <div className="msg-bubble-wrap">
                  {!m.mine && conversation.kind === 'GROUP' && firstOfGroup && (
                    <span className="msg-sender">{m.senderName}</span>
                  )}
                  <div className="msg-bubble">
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
                  <span className="msg-time">{fmtTime(m.createdAt)}</span>
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
            decifrando mensagem, aguarde até que ela seja enviada…
          </p>
        )}
      </div>

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
          <div className="msg-emoji-bar">
            {EMOJI_SHORTCUTS.map(([emoji, nome]) => (
              <button
                key={emoji}
                className="msg-emoji"
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
        </div>
        <button
          className="icon-btn send"
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
        <IconLock size={32} />
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
