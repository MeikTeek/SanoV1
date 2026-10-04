import { Link } from 'react-router-dom';
import { IconUsers } from '../ui/icons';
import NumberPanel from './NumberPanel';
import type { Conversation } from '../../services/chat.service';

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  myId: string;
  onOpened: (conversation: Conversation) => void;
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

/** Coluna esquerda: conversas + o painel do código de 15h. */
export default function ConversationList({ conversations, activeId, myId, onOpened }: Props) {
  return (
    <aside className="msg-side">
      <div className="msg-side-head">
        <b>Conversas</b>
        <span className="muted small">{conversations.length}</span>
      </div>

      <div className="msg-list">
        {conversations.length === 0 && (
          <p className="muted small pad">
            Nenhuma conversa ainda. Use o código de alguém abaixo ou abra um grupo.
          </p>
        )}

        {conversations.map((c) => {
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
                  {c.unread > 0 && <span className="dot-new">{c.unread}</span>}
                </div>
                <small className="muted">
                  {c.kind === 'GROUP' ? `${c.members.length} pessoas` : c.subtitle}
                </small>
              </div>
            </Link>
          );
        })}
      </div>

      <NumberPanel onOpened={onOpened} />
    </aside>
  );
}