import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import { Avatar } from '../../components/chat/ConversationList';
import { IconChat, IconSearch } from '../../components/ui/icons';
import { getDirectory, openDirectByUser, type DirectoryEntry } from '../../services/chat.service';
import { getIdentity } from '../../services/crypto.service';
import '../../styles/messages.css';

/**
 * Diretório de pessoas do hub — a "explorar" do módulo.
 *
 * Serve para descobrir quem existe, seguir e abrir conversa direto. Quem prefere
 * não usar busca pode abrir pelo código de 15h na tela de Mensagens.
 */
export default function PeoplePage() {
  const navigate = useNavigate();
  const [people, setPeople] = useState<DirectoryEntry[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // A busca vai no servidor (o diretório é pequeno, mas cresce).
  useEffect(() => {
    const t = window.setTimeout(() => {
      getDirectory(search.trim() || undefined)
        .then(setPeople)
        .catch((e) => setError((e as Error).message));
    }, 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const message = async (id: string) => {
    setBusy(true);
    setError('');
    try {
      await getIdentity();
      const conversation = await openDirectByUser(id);
      navigate(`/mensagens/${conversation.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell title="Pessoas" status={`${people.length} no diretório`} workspace>
      <div className="people-page">
        <div className="people-search">
          <IconSearch />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou @usuário"
            aria-label="Buscar pessoas"
          />
        </div>

        {people.length === 0 && <p className="muted pad">Ninguém encontrado.</p>}

        <div className="people-grid">
          {people.map((p) => (
            <article key={p.id} className="person-card">
              <Link to={`/perfil/${p.username}`} className="person-card-head">
                <Avatar url={p.avatarDataUrl} name={p.displayName} username={p.username} size={56} />
                <span className="person-card-name">
                  <b>{p.displayName || p.username}</b>
                  <small className="muted">@{p.username}</small>
                </span>
              </Link>

              <p className="person-bio">
                {p.bio ? p.bio : <span className="muted small">sem bio</span>}
              </p>

              <div className="person-card-foot">
                <span className="muted small">
                  {p.followersCount} seg. · {p.followingCount} seg.
                </span>
                <button className="ghost" onClick={() => void message(p.id)} disabled={busy} title="Enviar mensagem">
                  <IconChat size={16} /> Mensagem
                </button>
              </div>
            </article>
          ))}
        </div>

        {error && <div className="error">{error}</div>}
      </div>
    </AppShell>
  );
}