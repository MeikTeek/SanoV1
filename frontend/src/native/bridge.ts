/**
 * Ponte com o app Android do Sano (WebView em Flutter).
 *
 * Dentro do app existe `window.SanoNative.postMessage(json)`; as respostas
 * voltam como o evento `sano-native` no `window`. No navegador comum nada disso
 * existe e cada função vira um no-op — o site funciona igual, só sem os
 * recursos nativos (notificação agendada, widget).
 */

interface NativeChannel { postMessage(message: string): void }
declare global {
  interface Window { SanoNative?: NativeChannel }
}

export interface NativeInfo {
  platform: 'android';
  version: string;
  build: number;
  notifications: boolean;
}

export interface NativeReminder {
  /** Momento do aviso em ms desde a época. */
  at: number;
  title: string;
  body?: string;
  /** Tela do site aberta ao tocar na notificação. */
  path?: string;
}

export interface WidgetData {
  dayLabel: string;
  next: { title: string; when: string } | null;
  items: { time: string; title: string }[];
}

export const isNativeApp = () => typeof window !== 'undefined' && Boolean(window.SanoNative);

/** Navegador comum num Android: candidato a instalar o app. */
export const isAndroidBrowser = () =>
  typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent) && !/SanoApp\//.test(navigator.userAgent) && !isNativeApp();

let seq = 0;

/** Envia uma mensagem ao app e espera a resposta (ou `null` fora do app / sem resposta). */
function call<T>(type: string, payload: Record<string, unknown> = {}, timeoutMs = 8000): Promise<T | null> {
  const channel = window.SanoNative;
  if (!channel) return Promise.resolve(null);
  const id = `m${++seq}`;
  return new Promise((resolve) => {
    const onReply = (e: Event) => {
      const detail = (e as CustomEvent).detail as { replyTo?: string; error?: string } & T;
      if (detail?.replyTo !== id) return;
      cleanup();
      resolve(detail.error ? null : detail);
    };
    const timer = window.setTimeout(() => { cleanup(); resolve(null); }, timeoutMs);
    const cleanup = () => {
      window.removeEventListener('sano-native', onReply);
      window.clearTimeout(timer);
    };
    window.addEventListener('sano-native', onReply);
    channel.postMessage(JSON.stringify({ type, id, ...payload }));
  });
}

let infoCache: Promise<NativeInfo | null> | null = null;
/** Versão do app e estado das notificações (memorizado por sessão). */
export const nativeInfo = (fresh = false) => {
  if (!infoCache || fresh) infoCache = call<NativeInfo>('hello');
  return infoCache;
};

/** Pede a permissão de notificações do Android. */
export async function requestNativeNotifications() {
  const r = await call<{ notifications: boolean }>('requestNotifications', {}, 60_000);
  infoCache = null;
  return r?.notifications ?? false;
}

export const nativeNotify = (title: string, body?: string, path = '/', tag?: string) =>
  call('notify', { title, body, path, tag });

export const syncNativeReminders = (items: NativeReminder[]) =>
  call<{ scheduled: number }>('reminders', { items });

export const updateNativeWidget = (data: WidgetData) => call('widget', { ...data });

/** Saiu da conta: apaga lembretes agendados e limpa o widget. */
export const nativeLogout = () => call('logout');

/* ------------------------- agenda mudou → resincroniza ------------------------- */

const AGENDA_EVENT = 'sano:agenda-changed';
export const notifyAgendaChanged = () => window.dispatchEvent(new Event(AGENDA_EVENT));
export const onAgendaChanged = (fn: () => void) => {
  window.addEventListener(AGENDA_EVENT, fn);
  return () => window.removeEventListener(AGENDA_EVENT, fn);
};
