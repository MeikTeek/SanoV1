import type { Request, Response } from 'express';
import { onboardingSchema, completeBlockSchema, askAiSchema } from '../validators/trainer.validator';
import { logAudit } from '../services/audit.service';
import {
  onboardCall, dashboardCall, completeCall, libraryCall, reportCall, askCall, meta,
  dietCall, reviewCall, exerciseDetailCall,
} from '../services/trainer/api';

/** Op��es do cadastro � v�m do servidor para n�o duplicar r�tulos no frontend. */
export function metaHandler(_req: Request, res: Response) {
  res.json(meta());
}

/** Onboarding: cria o perfil e j� devolve a primeira miss�o narrada. */
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

/** Marca um bloco da miss�o do dia. */
export async function complete(req: Request, res: Response) {
  const { blockKey } = completeBlockSchema.parse(req.body);
  const result = await completeCall(req.user!.id, String(req.params.id), blockKey);
  if (result.completed) {
    await logAudit(req, 'TRAINER_MISSION_DONE', req.user!.id, { leveledUp: result.leveledUp });
  }
  res.json(result);
}

/** Lista os exerc�cios liberados e barrados � transpar�ncia sobre o filtro. */
export async function library(req: Request, res: Response) {
  res.json(await libraryCall(req.user!.id));
}

/** Relat�rio semanal � a IA formata, o c�digo fornece os n�meros. */
export async function report(req: Request, res: Response) {
  res.json(await reportCall(req.user!.id, req.user!.username));
}

/** Tira-d�vidas biomec�nico. */
export async function ask(req: Request, res: Response) {
  const { question } = askAiSchema.parse(req.body);
  const result = await askCall(req.user!.id, question);
  await logAudit(req, 'TRAINER_ASKED_AI', req.user!.id);
  res.json(result);
}

/** Plano alimentar do dia: n�meros calculados + refei��es escritas pela IA. */
export async function diet(req: Request, res: Response) {
  res.json(await dietCall(req.user!.id, req.user!.username));
}

/** Revis�o cr�tica do treino pela IA. */
export async function review(req: Request, res: Response) {
  res.json(await reviewCall(req.user!.id));
}

/** Detalhe de um exerc�cio (como fazer, m�sculo, erro comum, tempos). */
export function exerciseDetail(req: Request, res: Response) {
  res.json(exerciseDetailCall(String(req.params.key)));
}