/**
 * Memória curta do Sano por usuário.
 *
 * Objetivo: permitir continuação de conversa com código, sem IA —
 * "e amanhã?", "cancela essa", "esse mesmo", "e na semana que vem?".
 *
 * Guarda só o essencial da última interação: qual intenção rodou, os
 * compromissos que foram listados/criados e o dia que estava em foco. Nada de
 * texto livre do usuário (privacidade): apenas ids, títulos e datas.
 */
import { getPrismaClient } from '../../config/prisma';
import { isPendingAssistantAction, type PendingAssistantAction } from '../assistant/dialog';

export interface MemoryAppointment {
  id: string;
  title: string;
  startsAt: string; // ISO
}

export interface SanoMemory {
  /** Última intenção executada (ex.: "agenda"). */
  lastIntent: string | null;
  /** Compromissos envolvidos na última resposta — base do "cancela essa". */
  lastAppointments: MemoryAppointment[];
  /** Dia em foco (ISO yyyy-mm-dd) para "e amanhã?" / "e depois". */
  focusDay: string | null;
  pendingAction: PendingAssistantAction | null;
  updatedAt: string;
}

export const EMPTY_MEMORY: SanoMemory = {
  lastIntent: null,
  lastAppointments: [],
  focusDay: null,
  pendingAction: null,
  updatedAt: '',
};

const TOOL = 'sano';
const KEY = 'context';
const usesInMemoryStore = () => process.env.NODE_ENV === 'test' || !process.env.DATABASE_URL;
const localMemory = new Map<string, SanoMemory>();

function copyMemory(memory: SanoMemory): SanoMemory {
  return {
    ...memory,
    lastAppointments: memory.lastAppointments.map((appointment) => ({ ...appointment })),
    pendingAction: memory.pendingAction ? { ...memory.pendingAction } : null,
  };
}

export function clearAssistantMemoryForTests(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Assistant memory can only be cleared in test mode.');
  }
  localMemory.clear();
}

export async function loadMemory(userId: string): Promise<SanoMemory> {
  if (usesInMemoryStore()) {
    return copyMemory(localMemory.get(userId) ?? { ...EMPTY_MEMORY });
  }

  try {
    const row = await getPrismaClient().toolData.findUnique({
      where: { userId_tool_key: { userId, tool: TOOL, key: KEY } },
    });
    if (!row) return { ...EMPTY_MEMORY };
    const data = (row.data ?? {}) as Partial<SanoMemory>;
    return {
      lastIntent: data.lastIntent ?? null,
      lastAppointments: Array.isArray(data.lastAppointments) ? data.lastAppointments : [],
      focusDay: data.focusDay ?? null,
      pendingAction: isPendingAssistantAction(data.pendingAction) ? data.pendingAction : null,
      updatedAt: row.updatedAt.toISOString(),
    };
  } catch (err) {
    console.error('[sano] falha ao ler memória:', (err as Error)?.message ?? err);
    return { ...EMPTY_MEMORY };
  }
}

export async function saveMemory(userId: string, patch: Partial<SanoMemory>): Promise<void> {
  if (usesInMemoryStore()) {
    localMemory.set(userId, copyMemory({
      ...(localMemory.get(userId) ?? EMPTY_MEMORY),
      ...patch,
      updatedAt: new Date().toISOString(),
    }));
    return;
  }

  const current = await loadMemory(userId);
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  try {
    await getPrismaClient().toolData.upsert({
      where: { userId_tool_key: { userId, tool: TOOL, key: KEY } },
      create: { userId, tool: TOOL, key: KEY, data: next as never },
      update: { data: next as never },
    });
  } catch (err) {
    console.error('[sano] falha ao salvar memória:', (err as Error)?.message ?? err);
  }
}