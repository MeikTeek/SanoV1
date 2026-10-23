import type { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { aiConfigSchema, commandSchema, ttsSchema } from '../validators/sano.validator';
import * as tts from '../services/sano/tts.service';
import * as sanoAi from '../services/sano/ai.service';
import { handleCommand } from '../services/sano/router';
import { logAudit } from '../services/audit.service';
import * as agenda from '../services/agenda/service';
import * as trainer from '../services/trainer/api';
import { financeChat } from '../services/finance/chat';
import { agendaDeps } from '../services/agenda/deps';
import { buildGreeting } from '../services/sano/greeting';

const pingDb = async () => {
  const start = Date.now();
  await prisma.$queryRaw`SELECT 1`;
  return Date.now() - start;
};

// Intenções "ruidosas" que não vale a pena registrar na auditoria.
const QUIET = new Set(['help', 'greeting', 'time']);

export async function command(req: Request, res: Response) {
  const { message } = commandSchema.parse(req.body);

  const result = await handleCommand(req.user!, message, {
    pingDb,
    agenda: agendaDeps,
    trainer: {
      status: (userId) => trainer.statusForChat(userId),
      completeByName: (userId, name) => trainer.completeByName(userId, name),
      ask: async (userId, question) => (await trainer.askCall(userId, question)).answer,
    },
    finance: financeChat,
    ai: (input) => sanoAi.askSanoAi(req.user!.id, { ...input, displayName: req.user!.displayName || req.user!.username }),
  });

  // Privacidade: registra apenas a intenção, nunca o texto digitado.
  if (!QUIET.has(result.intent)) {
    await logAudit(req, 'SANO_COMMAND', req.user!.id, { intent: result.intent });
  }
  res.json(result);
}

/**
 * Saudação inicial da tela. Endpoint próprio (e não o comando "ajuda") para não
 * competir com o rate limit de 30/min do terminal.
 *
 * A saudão é curta: o detalhe do dia vem no `briefing`, que o painel lateral
 * consome sem precisar passar pelo chat.
 */
export async function greeting(req: Request, res: Response) {
  const user = req.user!;
  const today = await agenda.listToday(user.id);
  const name = user.displayName || user.username;

  // Status do treino para o painel (silencioso se o onboarding não existir).
  let training: Record<string, unknown> | null = null;
  try {
    training = await trainer.statusForChat(user.id) as unknown as Record<string, unknown>;
  } catch {
    training = null;
  }

  res.json({ greeting: buildGreeting(name, today, new Date()), training });
}

/** Dados dos painéis laterais (agenda de hoje + status), sem passar pelo chat. */
export async function panels(req: Request, res: Response) {
  const userId = req.user!.id;
  const today = await agenda.listToday(userId);
  // Próximos depois de hoje: o painel não fica vazio num dia livre.
  const tomorrow = new Date(Math.max(...today.map((a) => a.startsAt.getTime()), Date.now()) + 1);
  const upcoming = (await agenda.nextAppointments(userId, 8, tomorrow))
    .filter((a) => !today.some((t) => t.id === a.id))
    .slice(0, 4);

  let training = null;
  try {
    training = await trainer.statusForChat(userId);
  } catch {
    training = null;
  }

  let dbMs: number | null = null;
  try {
    dbMs = await pingDb();
  } catch {
    dbMs = null;
  }

  res.json({ today, upcoming, training, system: { dbMs } });
}

/* ───────── IA (chave OpenRouter do próprio usuário) ───────── */

export async function aiStatus(req: Request, res: Response) {
  res.json(await sanoAi.getAiStatus(req.user!.id));
}

export async function aiSave(req: Request, res: Response) {
  const input = aiConfigSchema.parse(req.body);
  const status = await sanoAi.saveAiConfig(req.user!.id, input);
  // Nunca a chave: só que ela mudou.
  await logAudit(req, input.apiKey ? 'SANO_AI_KEY_SET' : 'SANO_AI_MODEL_SET', req.user!.id, { model: status.model });
  res.json(status);
}

export async function aiRemove(req: Request, res: Response) {
  await sanoAi.removeAiConfig(req.user!.id);
  await logAudit(req, 'SANO_AI_KEY_REMOVED', req.user!.id);
  res.json(await sanoAi.getAiStatus(req.user!.id));
}

export async function aiQuota(req: Request, res: Response) {
  res.json({ quota: await sanoAi.getAiQuota(req.user!.id) });
}

export async function aiModels(_req: Request, res: Response) {
  res.json({ models: await sanoAi.listFreeModels() });
}

/* ───────── Voz neural (Edge TTS) ───────── */

export async function voices(_req: Request, res: Response) {
  res.json({ voices: await tts.listNeuralVoices(), defaultVoice: tts.DEFAULT_VOICE });
}

export async function speak(req: Request, res: Response) {
  const { text, voice, rate, pitch } = ttsSchema.parse(req.body);
  const audio = await tts.synthesize({ text, voice: voice ?? tts.DEFAULT_VOICE, rate, pitch });
  res.set({ 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=86400' }).send(audio);
}
