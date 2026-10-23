/** `run`: comando que só o navegador resolve (música), sugerido pela IA. */
export type SanoAction = { type: 'navigate'; to: string } | { type: 'run'; command: string };

export type SanoAiMessage = { role: 'system' | 'user' | 'assistant'; content: string };

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
    }
  | {
      kind: 'event';
      title: string;
      when: string;
      relative?: string;
      details: string[];
      state?: 'created' | 'updated' | 'canceled' | 'done' | 'info';
      actions?: { label: string; command: string }[];
    }
  | {
      kind: 'agenda';
      title: string;
      days: { label: string; items: { id: string; time: string; title: string; subtitle?: string; tag?: string }[] }[];
      emptyText?: string;
      footer?: string;
    };

export interface SanoResponse {
  intent: string;
  reply: string;
  actions?: SanoAction[];
  view?: SanoView;
  /** Respostas rápidas sugeridas pelo Sano. */
  suggestions?: string[];
  /** IA local: rodar estas mensagens no LM Studio e reenviar a frase com a resposta. */
  aiRequest?: { messages: SanoAiMessage[] };
}

export interface ChatMessage {
  id: number;
  /** Qual IA respondeu ("IA local · modelo", "OpenRouter"), quando houve IA. */
  via?: string;
  role: 'user' | 'sano' | 'error';
  text: string;
  /** Horário de exibição da mensagem. */
  at?: Date;
  /** Painel estruturado anexado à resposta. */
  view?: SanoView;
  suggestions?: string[];
}