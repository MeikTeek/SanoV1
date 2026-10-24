/**
 * Ponte com o app Sano para Windows (Electron).
 *
 * Dentro do app existe `window.SanoDesktop.run(frase)`: o app tenta entender a
 * frase como comando do computador (abrir programa, bloquear tela...) usando só
 * a lista de itens liberados pelo usuário. No navegador comum nada disso existe.
 */

export interface DesktopResult {
  /** false = não é comando de sistema; a frase segue para o servidor. */
  handled: boolean;
  ok?: boolean;
  reply?: string;
}

interface DesktopChannel {
  platform: 'windows';
  version: string;
  run(text: string): Promise<DesktopResult>;
}

declare global {
  interface Window { SanoDesktop?: DesktopChannel }
}

export const isDesktopApp = () => typeof window !== 'undefined' && Boolean(window.SanoDesktop);

/** Tenta executar a frase no computador. Fora do app, ou em falha, devolve `handled: false`. */
export async function runDesktopCommand(text: string): Promise<DesktopResult> {
  if (!window.SanoDesktop) return { handled: false };
  try {
    return await window.SanoDesktop.run(text);
  } catch {
    return { handled: false };
  }
}
