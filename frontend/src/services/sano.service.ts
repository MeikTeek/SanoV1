import { api } from './api';
import type { Appointment } from '../types/appointment';
import type { SanoResponse } from '../types/sano';

export const sendCommand = (message: string) => api.post<SanoResponse>('/sano/command', { message });

/** Resumo do treino usado no painel lateral e no orbe. */
export interface PanelTraining {
  onboarded: boolean;
  goalLabel?: string;
  level?: number;
  levelTitle?: string;
  streak?: number;
  debuffed?: boolean;
  mission?: { title: string; plannedMinutes: number; done: number; total: number } | null;
}

/** Saudação inicial (curta) + status do treino, para montar a tela. */
export const fetchGreeting = () =>
  api.get<{ greeting: string; training: PanelTraining | null }>('/sano/greeting');

/** Dados dos painéis laterais: agenda de hoje, treino e saúde do sistema. */
export const fetchPanels = () =>
  api.get<{ today: Appointment[]; upcoming?: Appointment[]; training: PanelTraining | null; system: { dbMs: number | null } }>('/sano/panels');
/* ───────── IA (chave OpenRouter do próprio usuário) ───────── */

export interface AiStatus { configured: boolean; model: string; keyHint: string | null; updatedAt: string | null }
export interface AiQuota {
  label: string | null;
  isFreeTier: boolean;
  freeDaily: { used: number; limit: number; remaining: number } | null;
}
export interface FreeModel { id: string; name: string; context: number }

export const fetchAiStatus = () => api.get<AiStatus>('/sano/ai');
export const saveAi = (body: { apiKey?: string; model?: string }) => api.put<AiStatus & { quota?: AiQuota }>('/sano/ai', body);
export const removeAi = () => api.delete<AiStatus>('/sano/ai');
export const fetchAiQuota = () => api.get<{ quota: AiQuota | null }>('/sano/ai/quota');
export const fetchFreeModels = () => api.get<{ models: FreeModel[] }>('/sano/ai/models');
export const testAi = () => api.post<{ ok: boolean; message: string; model: string }>('/sano/ai/test');
