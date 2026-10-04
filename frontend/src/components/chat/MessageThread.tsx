import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AudioPlayer from './AudioPlayer';
import AudioRecorder, { type Recording } from './AudioRecorder';
import { Avatar } from './ConversationList';
import { IconBack, IconImage, IconSend, IconUsers } from '../ui/icons';
import type { Conversation, Message } from '../../services/chat.service';

const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

interface Props {
  conversation: Conversation;
  myId: string;
  messages: Message[];
  busy: boolean;
  onSendText: (text: string) => void;
  onSendMedia: (blob: Blob, kind: 'IMAGE' | 'AUDIO', meta?: Record<string, unknown>) => void;
}

const MAX_IMAGE_BYTES = 900_000;

/** Coluna direita: cabeçalho, histórico e caixa de escrita. */
export default function MessageThread({
  conversation, myId, messages, busy, onSendText, onSendMedia,
}: Props) {
  const navigate = useNavigate();
  const logRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState('');

  // Rola até o fim quando chega mensagem nova.
  if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;

  const submit = () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
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
        <button className="icon-btn only-mobile" onClick={() => navigate('/mensagens')} aria-label="Voltar">
          <IconBack />
        </button>
        <div className="msg-thread-title">
          <b>{conversation.title}</b>
          <small className="muted">{conversation.subtitle ?? 'criptografado'}</small>
        </div>
        {conversation.kind === 'GROUP' && (
          <span className="msg-chip">{conversation.members.length} membros</span>
        )}
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
          return (
            <div key={m.id} className={`msg-row ${m.mine ? 'mine' : ''} ${firstOfGroup ? 'first' : ''}`}>
              {!m.mine && firstOfGroup && <Avatar url={m.senderAvatar} name={m.senderName} size={28} />}
              <div className="msg-bubble-wrap">
                {!m.mine && conversation.kind === 'GROUP' && firstOfGroup && (
                  <span className="msg-sender">{m.senderName}</span>
                )}
                <div className="msg-bubble">
                  {m.failed ? (
                    <span className="msg-failed">não consegui decifrar esta mensagem</span>
                  ) : m.kind === 'TEXT' ? (
                    <span>{m.text ?? 'decifrando…'}</span>
                  ) : m.kind === 'IMAGE' ? (
                    m.mediaUrl
                      ? <img className="msg-img" src={m.mediaUrl} alt="Imagem enviada" />
                      : <span className="muted small">decifrando imagem…</span>
                  ) : m.mediaUrl ? (
                    <AudioPlayer url={m.mediaUrl} seconds={m.meta?.seconds} />
                  ) : (
                    <span className="muted small">decifrando áudio…</span>
                  )}
                </div>
                <span className="msg-time">{fmtTime(m.createdAt)}</span>
              </div>
            </div>
          );
        })}
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
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
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

/** Estado vazio: nada aberto ainda. */
export function ThreadEmpty() {
  return (
    <section className="msg-thread">
      <div className="msg-empty">
        <IconUsers size={40} />
        <p>Escolha uma conversa ou comece uma pelo código de 15h.</p>
        <Link className="btn-inline" to="/pessoas">Ver pessoas</Link>
      </div>
    </section>
  );
}
