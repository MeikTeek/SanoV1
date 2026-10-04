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
  api.get<{ today: Appointment[]; training: PanelTraining | null; system: { dbMs: number | null } }>('/sano/panels');