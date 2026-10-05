import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { IconSearch, IconUnread, IconUsers } from '../ui/icons';
import NumberPanel from './NumberPanel';
import { previewOrPlaceholder, type Conversation } from '../../services/chat.service';

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  myId: string;
}

export const initials = (name?: string | null, username?: string) =>
  (name || username || '?').trim().slice(0, 2).toUpperCase();

/** Avatar em data URL ou iniciais. */
export function Avatar({
  url,
  name,
  username,
  size = 40,
}: {
  url?: string | null;
  name?: string | null;
  username?: string;
  size?: number;
}) {
  const style = { width: size, height: size, flexShrink: 0 } as const;
  return url
    ? <img src={url} alt="" style={{ ...style, borderRadius: '50%' }} />
    : <span className="mini-avatar" style={style}>{initials(name, username)}</span>;
}

/** "14:32" hoje; "ontem"; "12/03" para o resto. */
const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(d);
  const ontem = new Date(now);
  ontem.setDate(now.getDate() - 1);
  if (d.toDateString() === ontem.toDateString()) return 'ontem';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(d);
};

/**
 * Coluna esquerda: busca, conversas e o cartão do seu código.
 *
 * A lista mostra só conversas — nada de informações misturadas. O cartão do
 * código fica no rodapé porque é uma ação de uso eventual, não navegação.
 */
export default function ConversationList({ conversations, activeId, myId }: Props) {
  const [search, setSearch] = useState('');

  // Filtra por título (grupo) ou pelo @usuário do outro (DM).
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const other = c.members.find((m) => m.id !== myId);
      return (
        c.title.toLowerCase().includes(q) ||
        (other?.username ?? '').toLowerCase().includes(q) ||
        (other?.displayName ?? '').toLowerCase().includes(q)
      );
    });
  }, [conversations, search, myId]);

  return (
    <aside className="msg-side">
      <div className="msg-search">
        <IconSearch size={16} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar conversa"
          aria-label="Buscar conversa"
          spellCheck={false}
        />
      </div>

      <div className="msg-list">
        {visible.length === 0 && (
          <p className="muted small pad">
            {conversations.length === 0
              ? 'Nenhuma conversa ainda. Use “Nova” ou “Entrar com código”.'
              : 'Nenhuma conversa com esse nome.'}
          </p>
        )}

        {visible.map((c) => {
          const other = c.members.find((m) => m.id !== myId);
          return (
            <Link
              key={c.id}
              to={`/mensagens/${c.id}`}
              className={`msg-item ${c.id === activeId ? 'active' : ''}`}
            >
              {c.kind === 'GROUP'
                ? <span className="mini-avatar group"><IconUsers size={20} /></span>
                : <Avatar url={other?.avatarDataUrl} name={other?.displayName} username={other?.username} />}
              <div className="msg-item-body">
                <div className="msg-item-top">
                  <b>{c.title}</b>
                  <span className="msg-item-when">{fmtWhen(c.lastMessageAt)}</span>
                </div>
                <div className="msg-item-bottom">
                  <small className="msg-item-preview">{previewOrPlaceholder(c)}</small>
                  {c.unread > 0 && (
                    <span className="dot-unread" title={`${c.unread} não lida(s)`}>
                      <IconUnread size={9} />
                    </span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <NumberPanel />
    </aside>
  );
}