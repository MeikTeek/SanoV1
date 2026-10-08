/** Tipos do núcleo do Sano. Mantidos independentes do Prisma/Express para facilitar testes. */
import type { SanoMemory } from './context.service';

export type { SanoMemory };

export interface SanoUser {
  id: string;
  username: string;
  role: 'ADMIN' | 'USER';
  lastLoginAt: Date | null;
}

export interface SanoDeps {
  /** Retorna a latência (ms) de uma consulta simples ao banco. Lança erro se indisponível. */
  pingDb: () => Promise<number>;
  /**
   * Acesso à agenda do usuário. Injetado para que o núcleo do Sano não dependa
   * do Prisma e os testes continuem rodando sem banco.
   */
  agenda?: SanoAgendaDeps;
  /** Módulo de treino (Fase 4). */
  trainer?: SanoTrainerDeps;
}

export interface SanoTrainerDeps {
  /** Estado resumido, para o Sano falar sobre o treino. */
  status: (userId: string) => Promise<{
    onboarded: boolean;
    goalLabel?: string;
    level?: number;
    levelTitle?: string;
    streak?: number;
    debuffed?: boolean;
    mission?: { title: string; plannedMinutes: number; done: number; total: number; doneMinutes: number } | null;
  }>;
  /** Conclui um bloco pelo nome do exercício ("completei flexão"). */
  completeByName: (userId: string, exerciseName: string) => Promise<{ ok: boolean; message: string }>;
  /** Pergunta livre para a IA, já com o perfil e a lista de seguros do usuário. */
  ask: (userId: string, question: string) => Promise<string>;
}

export interface SanoAppointment {
  id: string;
  title: string;
  description?: string | null;
  participants?: string | null;
  startsAt: Date;
  endsAt?: Date | null;
  remindBefore?: number | null;
}

export interface SanoAgendaDeps {
  list: (userId: string, from?: Date, to?: Date) => Promise<SanoAppointment[]>;
  create: (userId: string, data: {
    title: string;
    participants?: string;
    startsAt: Date;
    endsAt?: Date;
    remindBefore?: number | null;
  }) => Promise<SanoAppointment>;
  findByTitle: (userId: string, term: string) => Promise<SanoAppointment[]>;
  cancel: (userId: string, id: string) => Promise<void>;
  update: (userId: string, id: string, data: {
    title?: string;
    startsAt?: Date;
    endsAt?: Date | null;
    participants?: string;
    remindBefore?: number | null;
  }) => Promise<SanoAppointment>;
  /** Lista os compromissos de um dia [from, to) — usado na confirmação. */
  listByDay: (userId: string, from: Date, to: Date) => Promise<SanoAppointment[]>;
  /** Cancela todos os compromissos pendentes do dia e devolve quantos foram. */
  cancelDay: (userId: string, from: Date, to: Date) => Promise<number>;
}

export interface SanoContext {
  user: SanoUser;
  text: string;       // texto original digitado
  normalized: string; // minúsculo, sem acentos, sem "Sano," no início
  now: Date;
  deps: SanoDeps;
  /** Memória do turno anterior (última intenção e lista exibida). */
  memory?: SanoMemory;
}

/** Ações que o frontend executa depois de mostrar a resposta. */
export type SanoAction = { type: 'navigate'; to: string };

/**
 * Respostas estruturadas ("painéis" / HUD) em vez de texto corrido.
 *
 * Cada intenção devolve, quando dá, um `view`: o frontend renderiza um cartão
 * (linha do tempo, medidores, grade de botões) em vez de despejar colunas de
 * texto. O `reply` continua existindo como fallback e para a leitura por
 * leitor de tela / terminal.
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

export interface SanoResult {
  reply: string;
  actions?: SanoAction[];
  /** Painel estruturado; quando ausente, o chat mostra só o texto. */
  view?: SanoView;
  /** O que esta resposta memoriza para permitir "cancela essa" / "e amanhã?". */
  memory?: { appointments?: SanoAppointment[]; focusDay?: string };
  dialog?: Partial<SanoMemory>;
}

export interface SanoResponse extends SanoResult {
  intent: string;
}

export interface Intent {
  name: string;
  description: string;
  examples: string[];
  /** Testados contra o texto normalizado. */
  patterns: RegExp[];
  adminOnly?: boolean;
  planned?: boolean; // módulo ainda não implementado
  hidden?: boolean;  // não aparece no "ajuda"
  handle: (ctx: SanoContext) => SanoResult | Promise<SanoResult>;
}