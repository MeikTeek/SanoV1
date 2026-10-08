export interface SanoAction {
  type: 'navigate';
  to: string;
}

/**
 * Painéis estruturados que o backend devolve no lugar de texto corrido.
 * O frontend escolhe o componente certo pelo `kind`.
 */
export type SanoView =
  | {
      kind: 'timeline';
      title: string;
      items: { id: string; time: string; title: string; subtitle?: string; badge?: string }[];
      emptyText?: string;
    }
  | {
      kind: 'meters';
      title: string;
      items: { label: string; value: string; percent?: number; tone?: 'ok' | 'warn' | 'bad' }[];
    }
  | {
      kind: 'actions';
      title: string;
      subtitle?: string;
      items: { label: string; command: string; hint?: string }[];
    }
  | {
      kind: 'profile';
      items: { label: string; value: string }[];
    }
  | {
      kind: 'briefing';
      headline: string;
      blocks: { title: string; lines: string[]; tone?: 'ok' | 'warn' | 'bad' }[];
    }
  | {
      kind: 'confirmation';
      title: string;
      details: string[];
      confirmCommand: string;
      cancelCommand: string;
    };

export interface SanoResponse {
  intent: string;
  reply: string;
  actions?: SanoAction[];
  view?: SanoView;
}

export interface ChatMessage {
  id: number;
  role: 'user' | 'sano' | 'error';
  text: string;
  /** Horário de exibição da mensagem. */
  at?: Date;
  /** Painel estruturado anexado à resposta. */
  view?: SanoView;
}