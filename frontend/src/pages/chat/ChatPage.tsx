import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import ConversationList, { Avatar } from '../../components/chat/ConversationList';
import MessageThread, { ThreadEmpty } from '../../components/chat/MessageThread';
import { IconHash, IconInfo, IconLock, IconPlus, IconSend } from '../../components/ui/icons';
import { useAuth } from '../../context/AuthContext';
import {
  createGroup, getIncomingFriendRequests, listConversations, listMessages, markRead,
  openDirectByNumber, publishPublicKey, respondFriendRequest, sendMessage, setPreview,
  type Conversation, type IncomingFriendRequest, type Message, type MessageKind,
} from '../../services/chat.service';
import {
  decryptText, decryptToObjectUrl, encryptBytes, encryptText,
  getIdentity, type Recipient,
} from '../../services/crypto.service';
import '../../styles/messages.css';

/** Intervalo do polling: rápido o bastante para parecer instantâneo, leve para o servidor. */
const POLL_MS = 5_000;

/**
 * Tela do Módulo 1.
 *
 * Nada aqui é legível pelo servidor: cada mensagem chega como `envelope` cifrado
 * e só é aberta no navegador, na hora de desenhar. O papel da tela é orquestrar:
 * carregar, decifrar, cifrar na saída e manter tudo atualizado.
 */
export default function ChatPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const activeId = useParams().id ?? null;
  const myId = user?.id ?? '';

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [friendRequests, setFriendRequests] = useState<IncomingFriendRequest[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupInvites, setGroupInvites] = useState('');

  /** URLs de mídia decifrada criadas nesta tela (revogadas no cleanup). */
  const mediaUrls = useRef<string[]>([]);
  /** Mensagens já abertas nesta sessão — evita decifrar duas vezes. */
  const opened = useRef(new Set<string>());
  /**
   * Texto já decifrado por id de mensagem, preservado entre recarregamentos.
   *
   * É a correção do bug: o servidor devolve sempre a mensagem crua (é o que a
   * criptografia ponta a ponta exige), então cada `setMessages(rows)` era um
   * convite a perder tudo que já tinha sido decifrado. Com o cache, reidratar
   * é só reler um mapa — e voltar a uma conversa não decifra de novo.
   */
  const decrypted = useRef(new Map<string, string>());

  /** Aplica uma correção a uma mensagem pelo id, preservando o resto. */
  const patch = (id: string, data: Partial<Message>) =>
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...data } : m)));

  /**
   * Junta o que veio do servidor ao que já está decifrado, marcando também
   * quais mensagens ainda não foram abertas.
   */
  const hydrate = useCallback((rows: Message[]): Message[] => {
    return rows.map((m) => {
      const text = m.kind === 'TEXT' ? decrypted.current.get(m.id) : undefined;
      if (text === undefined) return m;
      return { ...m, text };
    });
  }, []);

  /* --------------------------- identidade E2EE ---------------------------- */

  useEffect(() => {
    // A chave pública precisa estar no servidor antes de cifrar para alguém.
    getIdentity()
      .then((identity) => publishPublicKey(identity.publicKeyB64))
      .catch((e) => setError((e as Error).message));
  }, []);

  /* ------------------------------ carregamento ----------------------------- */

  const loadConversations = useCallback(async () => {
    try {
      setConversations(await listConversations());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const loadFriendRequests = useCallback(async () => {
    try {
      setFriendRequests(await getIncomingFriendRequests());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
    void loadFriendRequests();
  }, [loadConversations, loadFriendRequests]);

  useEffect(() => {
    const timer = window.setInterval(() => void loadFriendRequests(), 30_000);
    return () => window.clearInterval(timer);
  }, [loadFriendRequests]);

  // Carrega o histórico da conversa aberta, mais antigo primeiro.
  useEffect(() => {
    if (!activeId) {
      setActive(null);
      setMessages([]);
      opened.current.clear();
      return;
    }
    setActive((prev) => prev?.id === activeId ? prev : conversations.find((c) => c.id === activeId) ?? null);

    void (async () => {
      try {
        const rows = hydrate(await listMessages(activeId));
        setMessages(rows);
        void markRead(activeId).catch(() => {});
        if (rows[0]) {
          // Carrega o histórico anterior, para a conversa não abrir só no fim.
          const older = hydrate(await listMessages(activeId, rows[0].createdAt));
          if (older.length) setMessages([...older, ...rows]);
        }
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [activeId, conversations]);

  /* ---------------------- atualização ("tempo real") ----------------------- */

  /**
   * Polling em vez de WebSocket: o projeto não tem `ws` e o ganho de trazer a
    * dependência é pequeno frente a um evento a cada 5s por conversa aberta.
   */
  useEffect(() => {
    if (!activeId) return;
    const timer = window.setInterval(async () => {
      try {
        const rows = hydrate(await listMessages(activeId));
        // Só troca se mudou de verdade — evita re-render a cada ciclo.
        setMessages((prev) =>
          prev.length === rows.length && prev.every((p, i) => p.id === rows[i]?.id) ? prev : rows,
        );
        await loadConversations();
      } catch {
        // Falha de rede no polling não pode derrubar a tela.
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [activeId, loadConversations, hydrate]);
/* ---------------------------- decifrar mensagens ------------------------ */

  const recipients: Recipient[] = useMemo(
    () => (active?.members ?? []).map((m) => ({ id: m.id, publicKey: m.publicKey })),
    [active],
  );

  useEffect(() => {
    if (!active || !myId) return;

    for (const m of messages) {
      const key = `${active.id}:${m.id}`;
      if (opened.current.has(key)) continue;
      opened.current.add(key);

      void (async () => {
        try {
          if (m.kind === 'TEXT') {
            const text = await decryptText(active.id, myId, m.envelope);
            // Guarda no cache: a próxima releitura do servidor já vem com o
            // texto, e voltar a esta conversa não decifra tudo de novo.
            decrypted.current.set(m.id, text);
            patch(m.id, { text });
            setPreview(active.id, text);
          } else {
            const url = await decryptToObjectUrl(
              active.id, myId, m.envelope, m.meta?.mime ?? 'application/octet-stream',
            );
            mediaUrls.current.push(url);
            patch(m.id, { mediaUrl: url });
            setPreview(active.id, m.kind === 'IMAGE' ? '📷 Imagem' : '🎤 Áudio');
          }
        } catch {
          // Chave ausente ou dado adulterado: avisa sem revelar nada.
          patch(m.id, { failed: true });
        }
      })();
    }
  }, [messages, active, myId]);

  // Revoga as URLs de objeto ao trocar de conversa e ao sair da tela.
  useEffect(() => {
    const urls = mediaUrls.current;
    mediaUrls.current = [];
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [activeId]);

  /* ---------------------------------- envio ------------------------------- */

  const onSendText = async (text: string) => {
    if (!active) return;
    setBusy(true);
    setError('');
    try {
      const envelope = await encryptText(active.id, recipients, text);
      const message = await sendMessage(active.id, {
        envelope, kind: 'TEXT' as MessageKind, clientId: crypto.randomUUID(),
      });
      // O texto em claro vai junto: é o que o remetente vê na própria tela.
      decrypted.current.set(message.id, text);
      opened.current.add(`${active.id}:${message.id}`);
      setPreview(active.id, text);
      setMessages((prev) => [...prev, { ...message, text }]);
      void loadConversations();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onSendMedia = async (blob: Blob, kind: 'IMAGE' | 'AUDIO', meta: Record<string, unknown> = {}) => {
    if (!active) return;
    setBusy(true);
    setError('');
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const envelope = await encryptBytes(active.id, recipients, bytes);
      const message = await sendMessage(active.id, {
        envelope, kind, meta: { mime: blob.type, bytes: blob.size, ...meta },
        clientId: crypto.randomUUID(),
      });
      // A mídia só existe decifrada: enquanto isso, a bolha mostra
      // "decifrando imagem…", e a prévia da lista diz o tipo. Não entra no
      // `opened` de propósito — é essa lista que dispara a decifragem.
      setPreview(active.id, kind === 'IMAGE' ? '📷 Imagem' : '🎤 Áudio');
      setMessages((prev) => [...prev, message]);
      void loadConversations();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /* --------------------------------- grupos ------------------------------- */

  const submitGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    const invitees = groupInvites.split(/[\s,]+/).filter(Boolean);
    if (!groupName.trim() || invitees.length === 0) return;

    setBusy(true);
    setError('');
    try {
      const conversation = await createGroup(groupName.trim(), invitees);
      setShowNew(false);
      setGroupName('');
      setGroupInvites('');
      await loadConversations();
      navigate(`/mensagens/${conversation.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** Abre a conversa pelo código de 8 caracteres que a outra pessoa te deu. */
  const joinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = joinCode.trim();
    if (!value) return;

    setBusy(true);
    setError('');
    try {
      const conversation = await openDirectByNumber(value);
      setShowJoin(false);
      setJoinCode('');
      await loadConversations();
      navigate(`/mensagens/${conversation.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const answerFriendRequest = async (requestId: string, status: 'ACCEPTED' | 'REJECTED') => {
    setError('');
    try {
      await respondFriendRequest(requestId, status);
      await loadFriendRequests();
    } catch (e) {
      setError((e as Error).message);
    }
  };
/* --------------------------------- render ------------------------------- */

  return (
    <AppShell
      title="Mensagens"
      status="criptografia ponta a ponta"
      flush
      actions={
        <>
          <button className="ghost" onClick={() => setShowJoin(true)} title="Entrar com o código de alguém">
            <IconHash size={16} /> Entrar com código
          </button>
          <button className="ghost" onClick={() => setShowRequests(true)} title="Pedidos de amizade">
            Pedidos{friendRequests.length ? ` (${friendRequests.length})` : ''}
          </button>
          <button className="ghost" onClick={() => setShowNew(true)} title="Nova conversa">
            <IconPlus size={16} /> Nova
          </button>
        </>
      }
    >
      <div className={`msg-layout ${active ? 'has-active' : ''}`}>
        <div className={active ? 'hidden-mobile' : ''}>
          <ConversationList
            conversations={conversations}
            activeId={activeId}
            myId={myId}
          />
        </div>

        {active ? (
          <MessageThread
            conversation={active}
            myId={myId}
            messages={messages}
            busy={busy}
            onSendText={(t) => void onSendText(t)}
            onSendMedia={(b, k, m) => void onSendMedia(b, k, m)}
            onShowInfo={() => setShowInfo(true)}
          />
        ) : (
          <ThreadEmpty onNew={() => setShowNew(true)} onJoin={() => setShowJoin(true)} />
        )}
      </div>

      {(error || notice) && (
        <div className="msg-toast-area">
          {error && <div className="error">{error}</div>}
          {notice && <div className="notice">{notice}</div>}
        </div>
      )}

      {showNew && (
        <div className="modal-backdrop" onClick={() => setShowNew(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Nova conversa</h2>

            <form onSubmit={submitGroup} className="modal-section">
              <h3>Criar grupo</h3>
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Nome do grupo"
                maxLength={60}
                aria-label="Nome do grupo"
              />
              <input
                value={groupInvites}
                onChange={(e) => setGroupInvites(e.target.value)}
                placeholder="Códigos separados por espaço"
                aria-label="Convidados do grupo"
              />
              <button type="submit" disabled={busy || !groupName.trim() || !groupInvites.trim()}>
                Criar grupo
              </button>
              <small className="muted">
                Use somente os códigos temporários que as pessoas compartilharam com você.
              </small>
            </form>
          </div>
        </div>
      )}

      {showRequests && (
        <div className="modal-backdrop" onClick={() => setShowRequests(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Pedidos de amizade</h2>
            <div className="modal-section modal-people">
              {friendRequests.length === 0 && <p className="muted small">Nenhum pedido pendente.</p>}
              {friendRequests.map((request) => (
                <div key={request.id} className="person-row">
                  <Avatar
                    url={request.requester.avatarDataUrl}
                    name={request.requester.displayName}
                    username={request.requester.username}
                    size={38}
                  />
                  <Link to={`/perfil/${request.requester.username}`} className="person-info">
                    <b>{request.requester.displayName || request.requester.username}</b>
                    <small className="muted">Abrir perfil</small>
                  </Link>
                  <button onClick={() => void answerFriendRequest(request.id, 'ACCEPTED')}>Aceitar</button>
                  <button className="ghost" onClick={() => void answerFriendRequest(request.id, 'REJECTED')}>Recusar</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showJoin && (
        <div className="modal-backdrop" onClick={() => setShowJoin(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Entrar com código</h2>
            <form onSubmit={joinByCode} className="modal-section">
              <p className="muted small">
                Digite o código de 8 caracteres que a pessoa te passou. Ele troca a
                cada 15 horas — se tiver expirado, peça outro a ela.
              </p>
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="ABCD-2345"
                maxLength={9}
                autoComplete="off"
                spellCheck={false}
                aria-label="Código da outra pessoa"
                className="code-input"
              />
              <button type="submit" disabled={busy || !joinCode.trim()}>
                <IconSend size={16} /> Abrir conversa
              </button>
            </form>
          </div>
        </div>
      )}

      {showInfo && active && (
        <div className="modal-backdrop" onClick={() => setShowInfo(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{active.title}</h2>
            <div className="modal-section">
              <h3>Participantes</h3>
              <div className="modal-people">
                {active.members.map((m) => (
                  <div key={m.id} className="person-row">
                    <Avatar url={m.avatarDataUrl} name={m.displayName} username={m.username} size={34} />
                    <div>
                      <b>{m.displayName || m.username}{m.id === myId ? ' (você)' : ''}</b>
                      <small className="muted">
                        @{m.username}{m.publicKey ? ' · chave publicada' : ' · sem chave pública'}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-section">
              <h3><IconInfo size={13} /> Como esta conversa é protegida</h3>
              <p className="muted small">
                Cada participante tem um par de chaves. A sua privada nunca sai deste
                navegador; a pública fica no servidor. As mensagens são cifradas com
                AES-256-GCM sob uma chave derivada por participante e por conversa —
                só quem tem a chave privada correspondente abre o conteúdo.
              </p>
              <p className="muted small">
                O servidor vê <em>quem</em> conversou com <em>quem</em>, e <em>quando</em>.
                O que foi dito, ele não vê.
              </p>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}