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
import { prisma } from '../../config/prisma';
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

/**
 * Usuários sem memória persistente (id inexistente no banco, como nos testes
 * com doubles). Evita repetir a consulta que sempre vai falhar — e o chat segue
 * funcionando normalmente, só sem continuação de conversa.
 */
const noMemory = new Set<string>();
const localMemory = new Map<string, SanoMemory>();

/** Carrega a memória; ausencia/erro vira memória vazia (nunca quebra o chat). */
export async function loadMemory(userId: string): Promise<SanoMemory> {
  if (noMemory.has(userId)) return localMemory.get(userId) ?? { ...EMPTY_MEMORY };
  try {
    const row = await prisma.toolData.findUnique({
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
    markUnusable(userId, err);
    return { ...EMPTY_MEMORY };
  }

}

/** Marca o usuário como sem memória quando a falha é estrutural (não é transitória). */
function markUnusable(userId: string, err: unknown) {
  const msg = (err as Error)?.message ?? '';
  if (/Foreign key constraint|does not exist|Record to (update|delete) not found/i.test(msg)) {
    noMemory.add(userId);
  } else {
    console.error('[sano] falha ao ler memória:', msg);
  }
}

/** Grava a memória pós-resposta. Falha aqui é silenciosa por design. */
export async function saveMemory(userId: string, patch: Partial<SanoMemory>): Promise<void> {
  if (noMemory.has(userId)) {
    localMemory.set(userId, {
      ...(localMemory.get(userId) ?? EMPTY_MEMORY),
      ...patch,
      updatedAt: new Date().toISOString(),
    });
    return;
  }
  const current = await loadMemory(userId);
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  try {
    await prisma.toolData.upsert({
      where: { userId_tool_key: { userId, tool: TOOL, key: KEY } },
      create: { userId, tool: TOOL, key: KEY, data: next as never },
      update: { data: next as never },
    });
  } catch (err) {
    markUnusable(userId, err);
    if (noMemory.has(userId)) localMemory.set(userId, next);
  }
}