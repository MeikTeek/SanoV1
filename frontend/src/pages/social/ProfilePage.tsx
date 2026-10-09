import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import { Avatar } from '../../components/chat/ConversationList';
import { IconKey } from '../../components/ui/icons';
import { useAuth } from '../../context/AuthContext';
import {
  getProfile, requestFriendship, respondFriendRequest, setBio, type PersonProfile,
} from '../../services/chat.service';
import '../../styles/messages.css';

const MAX_BIO = 280;

const fmtJoined = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(iso));

/**
 * Perfil acessado a partir de uma conversa direta. Pedidos de amizade só são
 * permitidos entre pessoas que já têm uma conversa.
 *
 * Só o dono edita a própria bio; e a bio é texto puro (o servidor limita em 280),
 * então não há espaço para HTML injetado aqui.
 */
export default function ProfilePage() {
  const { username } = useParams();
  const { user } = useAuth();

  const [profile, setProfile] = useState<PersonProfile | null>(null);
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
  }, [load]);

  useEffect(() => {
    if (!username || !profile || profile.isSelf) return;
    const timer = window.setInterval(() => {
      getProfile(username).then(setProfile).catch((e) => setError((e as Error).message));
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [username, profile?.isSelf]);

  const sendFriendRequest = async () => {
    if (!profile) return;
    setBusy(true);
    setError('');
    try {
      await requestFriendship(profile.username);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const answerFriendRequest = async (status: 'ACCEPTED' | 'REJECTED') => {
    if (!profile?.friendshipRequestId) return;
    setBusy(true);
    setError('');
    try {
      await respondFriendRequest(profile.friendshipRequestId, status);
      await load();
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

  const isSelf = profile?.isSelf ?? user?.username === username;

  return (
    <AppShell title={profile?.displayName || `@${username}`} status="perfil">
      <div className="profile-page">
        <section className="profile-head">
          <div className="profile-primary">
            <Avatar url={profile?.avatarDataUrl} name={profile?.displayName} username={profile?.username} size={96} />

            <div className="profile-info">
              <div className="profile-row">
                <div className="profile-name">
                  <h2>{profile?.displayName || profile?.username}</h2>
                  <p className="profile-user muted">@{profile?.username}</p>
                </div>
                {isSelf ? (
                  <button className="ghost" onClick={() => setEditing((v) => !v)}>
                    {editing ? 'Cancelar' : 'Editar bio'}
                  </button>
                ) : profile?.friendshipStatus === 'NONE' ? (
                  <button onClick={() => void sendFriendRequest()} disabled={busy}>Adicionar amigo</button>
                ) : profile?.friendshipStatus === 'REQUEST_RECEIVED' ? (
                  <div className="inline">
                    <button onClick={() => void answerFriendRequest('ACCEPTED')} disabled={busy}>Aceitar pedido</button>
                    <button className="ghost" onClick={() => void answerFriendRequest('REJECTED')} disabled={busy}>Recusar</button>
                  </div>
                ) : (
                  <span className={`friendship-chip ${profile?.friendshipStatus === 'FRIEND' ? 'accepted' : ''}`}>
                    {profile?.friendshipStatus === 'FRIEND'
                      ? 'Amigos'
                      : profile?.friendshipStatus === 'REQUEST_SENT'
                        ? 'Pedido enviado'
                        : 'Pedido recusado'}
                  </span>
                )}
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

            </div>
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
            {!isSelf && profile?.isOnline !== null && profile?.isOnline !== undefined && (
              <div className="profile-meta-item">
                <span>Presença</span>
                <b className={profile.isOnline ? 'is-online' : ''}>{profile.isOnline ? 'Online' : 'Offline'}</b>
              </div>
            )}
            {!isSelf && profile?.activityStatus && (
              <div className="profile-meta-item">
                <span>Atividade</span>
                <b>{profile.activityStatus}</b>
              </div>
            )}
            {isSelf && (
              <div className="profile-meta-item profile-key-hint">
                <span>Seu código de 15h</span>
                <b><IconKey size={14} /> Disponível em Mensagens</b>
              </div>
            )}
          </aside>
        </section>

        {error && <div className="error">{error}</div>}
      </div>
    </AppShell>
  );
}
