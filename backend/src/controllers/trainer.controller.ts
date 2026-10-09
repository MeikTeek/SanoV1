import type { Request, Response } from 'express';
import { onboardingSchema, completeBlockSchema, askAiSchema, bodyAssessmentSchema, workoutLogSchema } from '../validators/trainer.validator';
import { logAudit } from '../services/audit.service';
import {
  onboardCall, dashboardCall, completeCall, libraryCall, reportCall, askCall, meta,
  dietCall, reviewCall, exerciseDetailCall,
  weeklyPlanCall, dataCall, saveAssessmentCall, logWorkoutCall,
} from '../services/trainer/api';

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

/** Marca um bloco da missão do dia. */
export async function complete(req: Request, res: Response) {
  const { blockKey } = completeBlockSchema.parse(req.body);
  const result = await completeCall(req.user!.id, String(req.params.id), blockKey);
  if (result.completed) {
    await logAudit(req, 'TRAINER_MISSION_DONE', req.user!.id, { leveledUp: result.leveledUp });
  }
  res.json(result);
}

/** Lista os exercícios liberados e barrados — transparência sobre o filtro. */
export async function library(req: Request, res: Response) {
  res.json(await libraryCall(req.user!.id));
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

/** Registra exercícios concluídos para histórico e estimativas de força. */
export async function logWorkout(req: Request, res: Response) {
  const { entries } = workoutLogSchema.parse(req.body);
  const result = await logWorkoutCall(req.user!.id, entries);
  await logAudit(req, 'TRAINER_WORKOUT_LOGGED', req.user!.id, { entries: result.saved });
  res.status(201).json(result);
}