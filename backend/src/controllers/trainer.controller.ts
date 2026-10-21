import type { Request, Response } from 'express';
import { onboardingSchema, askAiSchema, bodyAssessmentSchema, workoutSessionSchema, swapSchema } from '../validators/trainer.validator';
import { logAudit } from '../services/audit.service';
import {
  onboardCall, dashboardCall, libraryCall, reportCall, askCall, meta,
  dietCall, reviewCall, exerciseDetailCall,
  weeklyPlanCall, dataCall, saveAssessmentCall,
} from '../services/trainer/api';
import * as workouts from '../services/trainer/workouts';

/** Opções do cadastro — vêm do servidor para não duplicar rótulos no frontend. */
export function metaHandler(_req: Request, res: Response) {
  res.json(meta());
}

/** Onboarding: cria o perfil e já devolve a primeira missão narrada. */
export async function onboard(req: Request, res: Response) {
  const data = onboardingSchema.parse(req.body);
  const result = await onboardCall(req.user!.id, req.user!.username, data);
  await logAudit(req, 'TRAINER_ONBOARDED', req.user!.id, { goal: data.goal, injuries: data.injuries });
  res.status(201).json(result);
}

/** Estado completo do dashboard. Aplica a penalidade antes de responder. */
export async function dashboard(req: Request, res: Response) {
  res.json(await dashboardCall(req.user!.id));
}

/** Lista os exercícios liberados e barrados — transparência sobre o filtro. */
export async function library(req: Request, res: Response) {
  const query = typeof req.query.q === 'string' ? req.query.q : '';
  const group = typeof req.query.group === 'string' ? req.query.group : '';
  const equipment = typeof req.query.equipment === 'string' ? req.query.equipment : '';
  res.json(await libraryCall(req.user!.id, { query, group, equipment }));
}

/** Relatório semanal — a IA formata, o código fornece os números. */
export async function report(req: Request, res: Response) {
  res.json(await reportCall(req.user!.id, req.user!.username));
}

/** Tira-dúvidas biomecânico. */
export async function ask(req: Request, res: Response) {
  const { question } = askAiSchema.parse(req.body);
  const result = await askCall(req.user!.id, question);
  await logAudit(req, 'TRAINER_ASKED_AI', req.user!.id);
  res.json(result);
}

/** Plano alimentar do dia: números calculados + refeições escritas pela IA. */
export async function diet(req: Request, res: Response) {
  res.json(await dietCall(req.user!.id, req.user!.username));
}

/** Revisão crítica do treino pela IA. */
export async function review(req: Request, res: Response) {
  res.json(await reviewCall(req.user!.id));
}

/** Detalhe de um exercício (como fazer, músculo, erro comum, tempos). */
export function exerciseDetail(req: Request, res: Response) {
  res.json(exerciseDetailCall(String(req.params.key)));
}

/** Plano semanal com divisão, exercícios e matriz de recuperação. */
export async function weeklyPlan(req: Request, res: Response) {
  res.json(await weeklyPlanCall(req.user!.id));
}

/** Métricas, histórico corporal, volume e aderência. */
export async function data(req: Request, res: Response) {
  res.json(await dataCall(req.user!.id));
}

/** Avaliação quinzenal; uma resposta por dia pode ser atualizada. */
export async function saveAssessment(req: Request, res: Response) {
  const data = bodyAssessmentSchema.parse(req.body);
  const result = await saveAssessmentCall(req.user!.id, data);
  await logAudit(req, 'TRAINER_BODY_ASSESSMENT', req.user!.id);
  res.status(201).json(result);
}

/** Hoje, semana, progresso, recordes e conquistas — tudo derivado do histórico. */
export async function overview(req: Request, res: Response) {
  res.json(await workouts.overview(req.user!.id));
}

/** Treino de um dia da semana com a última execução e a carga sugerida por exercício. */
export async function workoutDay(req: Request, res: Response) {
  const weekday = Number(req.params.weekday);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    res.status(400).json({ error: 'Dia inválido.' });
    return;
  }
  res.json(await workouts.workoutForDay(req.user!.id, weekday));
}

/** Sessão concluída com as séries reais. Devolve recordes, XP e nível. */
export async function logSession(req: Request, res: Response) {
  const data = workoutSessionSchema.parse(req.body);
  const result = await workouts.logSession(req.user!.id, data);
  await logAudit(req, 'TRAINER_WORKOUT_LOGGED', req.user!.id, { entries: result.totals.exercises, sets: result.totals.sets });
  res.status(201).json(result);
}

export async function deleteSession(req: Request, res: Response) {
  res.json(await workouts.deleteSession(req.user!.id, String(req.params.id)));
}

/** Alternativas seguras para trocar um exercício do plano. */
export async function swapOptions(req: Request, res: Response) {
  const weekday = Number(req.query.weekday);
  const exerciseKey = typeof req.query.exerciseKey === 'string' ? req.query.exerciseKey : '';
  const { weekday: day, exerciseKey: key } = swapSchema.pick({ weekday: true, exerciseKey: true }).parse({ weekday, exerciseKey });
  res.json(await workouts.swapOptionsFor(req.user!.id, day, key));
}

export async function swapExercise(req: Request, res: Response) {
  const { weekday, exerciseKey, replacementKey } = swapSchema.parse(req.body);
  res.json(await workouts.swapExercise(req.user!.id, weekday, exerciseKey, replacementKey));
}

/** Histórico, recordes e sugestão de um exercício. */
export async function exerciseStats(req: Request, res: Response) {
  res.json(await workouts.exerciseStats(req.user!.id, String(req.params.key)));
}
