import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import ConversationList, { Avatar } from '../../components/chat/ConversationList';
import MessageThread, { ThreadEmpty } from '../../components/chat/MessageThread';
import { IconPlus } from '../../components/ui/icons';
import { useAuth } from '../../context/AuthContext';
import {
  createGroup, getDirectory, listConversations, listMessages, markRead,
  openDirectByUser, publishPublicKey, sendMessage,
  type Conversation, type DirectoryEntry, type Message, type MessageKind,
} from '../../services/chat.service';
import {
  decryptText, decryptToObjectUrl, encryptBytes, encryptText,
  getIdentity, type Recipient,
} from '../../services/crypto.service';
import '../../styles/messages.css';

/** Intervalo do polling: r�pido o bastante para parecer instant�neo, leve para o servidor. */
const POLL_MS = 5_000;

/**
 * Tela do M�dulo 1.
 *
 * Nada aqui � leg�vel pelo servidor: cada mensagem chega como `envelope` cifrado
 * e s� � aberta no navegador, na hora de desenhar. O papel da tela � orquestrar:
 * carregar, decifrar, cifrar na sa�da e manter tudo atualizado.
 */
export default function ChatPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const activeId = useParams().id ?? null;
  const myId = user?.id ?? '';

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [directory, setDirectory] = useState<DirectoryEntry[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupInvites, setGroupInvites] = useState('');

  /** URLs de m�dia decifrada criadas nesta tela (revogadas no cleanup). */
  const mediaUrls = useRef<string[]>([]);
  /** Mensagens j� abertas nesta sess�o � evita decifrar duas vezes. */
  const opened = useRef(new Set<string>());

  /* --------------------------- identidade E2EE ---------------------------- */

  useEffect(() => {
    // A chave p�blica precisa estar no servidor antes de cifrar para algu�m.
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

  useEffect(() => {
    void loadConversations();
    getDirectory().then(setDirectory).catch(() => {});
  }, [loadConversations]);

  // Carrega o hist�rico da conversa aberta, mais antigo primeiro.
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
        const rows = await listMessages(activeId);
        setMessages(rows);
        void markRead(activeId).catch(() => {});
        if (rows[0]) {
          // Carrega o hist�rico anterior, para a conversa n�o abrir s� no fim.
          const older = await listMessages(activeId, rows[0].createdAt);
          if (older.length) setMessages([...older, ...rows]);
        }
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [activeId, conversations]);

  /* ---------------------- atualiza��o ("tempo real") ----------------------- */

  /**
   * Polling em vez de WebSocket: o projeto n�o tem `ws` e o ganho de trazer a
   * depend�ncia � pequeno frente a um evento a cada 5s por conversa aberta.
   */
  useEffect(() => {
    if (!activeId) return;
    const timer = window.setInterval(async () => {
      try {
        const rows = await listMessages(activeId);
        // S� troca se mudou de verdade � evita re-render a cada ciclo.
        setMessages((prev) =>
          prev.length === rows.length && prev.every((p, i) => p.id === rows[i]?.id) ? prev : rows,
        );
        await loadConversations();
      } catch {
        // Falha de rede no polling n�o pode derrubar a tela.
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [activeId, loadConversations]);
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
            setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, text } : x)));
          } else {
            const url = await decryptToObjectUrl(
              active.id, myId, m.envelope, m.meta?.mime ?? 'application/octet-stream',
            );
            mediaUrls.current.push(url);
            setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, mediaUrl: url } : x)));
          }
        } catch {
          // Chave ausente ou dado adulterado: avisa sem revelar nada.
          setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, failed: true } : x)));
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
      // O texto em claro vai junto: � o que o remetente v� na pr�pria tela.
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

  const startDirect = async (personId: string) => {
    setBusy(true);
    setError('');
    try {
      const conversation = await openDirectByUser(personId);
      setShowNew(false);
      await loadConversations();
      navigate(`/mensagens/${conversation.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
/* --------------------------------- render ------------------------------- */

  return (
    <AppShell
      title="Mensagens"
      status="criptografia ponta a ponta"
      actions={
        <button className="ghost" onClick={() => setShowNew((v) => !v)} title="Nova conversa">
          <IconPlus size={16} /> Nova
        </button>
      }
    >
      <div className="msg-layout">
        <div className={active ? 'hidden-mobile' : ''}>
          <ConversationList
            conversations={conversations}
            activeId={activeId}
            myId={myId}
            onOpened={(c) => navigate(`/mensagens/${c.id}`)}
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
          />
        ) : (
          <ThreadEmpty />
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
                placeholder="@usuario ou c�digos separados por espa�o"
                aria-label="Convidados do grupo"
              />
              <button type="submit" disabled={busy || !groupName.trim() || !groupInvites.trim()}>
                Criar grupo
              </button>
              <small className="muted">
                Aceita @usuario ou o c�digo de 8 caracteres de cada pessoa.
              </small>
            </form>

            <div className="modal-section">
              <h3>Ou comece uma conversa direta</h3>
              <div className="modal-people">
                {directory.slice(0, 12).map((p) => (
                  <button key={p.id} className="person-row" onClick={() => void startDirect(p.id)}>
                    <Avatar url={p.avatarDataUrl} name={p.displayName} username={p.username} size={34} />
                    <div>
                      <b>{p.displayName || p.username}</b>
                      <small className="muted">@{p.username}</small>
                    </div>
                  </button>
                ))}
                {directory.length === 0 && <small className="muted">Ningu�m no diret�rio ainda.</small>}
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}