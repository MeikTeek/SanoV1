import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import { Avatar } from '../../components/chat/ConversationList';
import { IconChat, IconKey } from '../../components/ui/icons';
import { useAuth } from '../../context/AuthContext';
import {
  followUser, getProfile, getRelations, openDirectByUser, setBio, unfollowUser,
  type Person, type PersonProfile,
} from '../../services/chat.service';
import { getIdentity } from '../../services/crypto.service';
import '../../styles/messages.css';

type Tab = 'followers' | 'following';

const MAX_BIO = 280;

const fmtJoined = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(iso));

/**
 * Perfil público no estilo Instagram: foto, bio, contadores e a lista de
 * seguidores/seguindo.
 *
 * Só o dono edita a própria bio; e a bio é texto puro (o servidor limita em 280),
 * então não há espaço para HTML injetado aqui.
 */
export default function ProfilePage() {
  const { username } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [profile, setProfile] = useState<PersonProfile | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!username) return;
    try {
      const p = await getProfile(username);
      setProfile(p);
      setBio(p.bio ?? '');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [username]);

  useEffect(() => {
    void load();
    setTab(null);
    setPeople([]);
  }, [load]);

  const openTab = async (next: Tab) => {
    if (!username) return;
    // Clicar de novo na aba ativa fecha a lista.
    if (tab === next) {
      setTab(null);
      return;
    }
    setTab(next);
    try {
      setPeople(await getRelations(username, next));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const toggleFollow = async () => {
    if (!profile) return;
    setBusy(true);
    setError('');
    try {
      const next = profile.isFollowing
        ? await unfollowUser(profile.username)
        : await followUser(profile.username);
      setProfile(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveBio = async () => {
    setBusy(true);
    setError('');
    try {
      await setBio(bio);
      setEditing(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const message = async () => {
    if (!profile) return;
    setBusy(true);
    setError('');
    try {
      // Publica a chave antes de abrir: sem ela não dá para cifrar a mensagem.
      await getIdentity();
      const conversation = await openDirectByUser(profile.id);
      navigate(`/mensagens/${conversation.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const isSelf = profile?.isSelf ?? user?.username === username;

  return (
    <AppShell title={profile?.displayName || `@${username}`} status="perfil" flush>
      <div className="profile-page">
        <section className="profile-head">
          <Avatar url={profile?.avatarDataUrl} name={profile?.displayName} username={profile?.username} size={96} />

          <div className="profile-info">
            <div className="profile-row">
              <h2>{profile?.displayName || profile?.username}</h2>
              {isSelf ? (
                <button className="ghost" onClick={() => setEditing((v) => !v)}>
                  {editing ? 'Cancelar' : 'Editar bio'}
                </button>
              ) : (
                <>
                  <button onClick={() => void toggleFollow()} disabled={busy}>
                    {profile?.isFollowing ? 'Seguindo' : 'Seguir'}
                  </button>
                  <button className="ghost" onClick={() => void message()} disabled={busy} title="Enviar mensagem">
                    <IconChat size={18} /> Mensagem
                  </button>
                </>
              )}
            </div>

            <p className="profile-user muted">@{profile?.username}</p>

            <div className="profile-stats">
              <button onClick={() => void openTab('followers')}>
                <b>{profile?.followersCount ?? 0}</b> <span>seguidores</span>
              </button>
              <button onClick={() => void openTab('following')}>
                <b>{profile?.followingCount ?? 0}</b> <span>seguindo</span>
              </button>
            </div>

            {editing ? (
              <div className="profile-bio-edit">
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, MAX_BIO))}
                  rows={3}
                  maxLength={MAX_BIO}
                  placeholder="Fale sobre você"
                  aria-label="Bio"
                />
                <div className="inline">
                  <span className="muted small">{bio.length}/{MAX_BIO}</span>
                  <button onClick={() => void saveBio()} disabled={busy}>Salvar</button>
                </div>
              </div>
            ) : (
              <p className="profile-bio">{profile?.bio || <span className="muted">sem bio ainda</span>}</p>
            )}

            {profile?.followsYou && !isSelf && <span className="msg-chip">segue você</span>}
          </div>

          <aside className="profile-meta" aria-label="Detalhes do perfil">
            <div className="profile-meta-item">
              <span>Membro desde</span>
              <b>{profile ? fmtJoined(profile.createdAt) : 'Carregando...'}</b>
            </div>
            <div className="profile-meta-item">
              <span>Mensagens</span>
              <b className={profile?.publicKey ? 'is-online' : ''}>
                {profile?.publicKey ? 'Chave segura ativa' : 'Ainda não configuradas'}
              </b>
            </div>
            {isSelf && (
              <div className="profile-meta-item profile-key-hint">
                <span>Seu código de 15h</span>
                <b><IconKey size={14} /> Disponível em Mensagens</b>
              </div>
            )}
          </aside>
        </section>

        {tab && (
          <section className="card profile-network">
            <h3 className="profile-section-title">Rede de @{profile?.username}</h3>
            <div className="tabs">
              <button className={tab === 'followers' ? 'active' : ''} onClick={() => void openTab('followers')}>
                Seguidores
              </button>
              <button className={tab === 'following' ? 'active' : ''} onClick={() => void openTab('following')}>
                Seguindo
              </button>
            </div>

            <div className="people-list">
              {people.length === 0 && <small className="muted">Nada por aqui ainda.</small>}
              {people.map((p) => (
                <div key={p.id} className="person-row">
                  <Avatar url={p.avatarDataUrl} name={p.displayName} username={p.username} size={40} />
                  <Link to={`/perfil/${p.username}`} className="person-info">
                    <b>{p.displayName || p.username}</b>
                    <small className="muted">{p.bio ? p.bio.slice(0, 60) : `@${p.username}`}</small>
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}

        {error && <div className="error">{error}</div>}
        {profile && !profile.publicKey && !isSelf && (
          <div className="hud-alert">
            Esta pessoa ainda não abriu o bate-papo — você pode seguir, mas ainda não enviar mensagem.
          </div>
        )}
      </div>
    </AppShell>
  );
}
