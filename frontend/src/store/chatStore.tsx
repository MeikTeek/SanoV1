import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ChatMessage } from '../types/sano';

/**
 * Estado do chat elevado para fora das páginas.
 *
 * Antes o histórico vivia dentro do ChatTerminal: trocar de rota desmontava o
 * componente e apagava tudo. Agora a conversa sobrevive à navegação e ainda é
 * salva em sessionStorage, então recarregar a página não joga fora o contexto.
 */

interface ChatState {
  messages: ChatMessage[];
  setMessages: (fn: (m: ChatMessage[]) => ChatMessage[]) => void;
  /** Verdadeiro enquanto o Sano processa — dirige o estado do orbe. */
  busy: boolean;
  setBusy: (b: boolean) => void;
  /** Texto da espera ("processando", "consultando") exibido junto do orbe. */
  thinking: string;
  setThinking: (t: string) => void;
  /** Quando muda, os painéis laterais recarregam. */
  refreshKey: number;
  refreshPanels: () => void;
  reset: () => void;
}

const Ctx = createContext<ChatState>(null!);
export const useChat = () => useContext(Ctx);

const STORAGE_KEY = 'sano:chat:v1';

/** Recupera o que sobrou da sessão anterior; JSON inválido é ignorado. */
function loadInitial(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    return Array.isArray(parsed) ? parsed.map((m) => ({ ...m, at: m.at ? new Date(m.at) : undefined })) : [];
  } catch {
    return [];
  }
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setRaw] = useState<ChatMessage[]>(loadInitial);
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState('processando…');
  const [refreshKey, setRefreshKey] = useState(0);

  const persist = (next: ChatMessage[]) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(-100)));
    } catch {
      /* cota cheia ou modo privativo: seguir sem persistir */
    }
  };

  const value = useMemo<ChatState>(() => ({
    messages,
    busy,
    thinking,
    refreshKey,
    setBusy,
    setThinking,
    refreshPanels: () => setRefreshKey((k) => k + 1),
    setMessages: (fn) => setRaw((prev) => {
      const next = fn(prev);
      persist(next);
      // Resposta do Sano pode ter mudado agenda/treino → recarrega painéis.
      if (next.length > prev.length && next[next.length - 1].role === 'sano') {
        setRefreshKey((k) => k + 1);
      }
      return next;
    }),
    reset: () => { setRaw([]); try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignora */ } },
  }), [messages, busy, thinking, refreshKey]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}