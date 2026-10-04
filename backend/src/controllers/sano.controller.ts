import type { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { commandSchema } from '../validators/sano.validator';
import { handleCommand } from '../services/sano/router';
import { logAudit } from '../services/audit.service';
import * as agenda from '../services/agenda/service';
import * as trainer from '../services/trainer/api';
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
    agenda: {
      list: (userId, from, to) => agenda.listAppointments(userId, from, to),
      create: (userId, data) => agenda.createAppointment(userId, data),
      findByTitle: (userId, term) => agenda.findByTitle(userId, term),
      cancel: async (userId, id) => { await agenda.updateAppointment(userId, id, { status: 'CANCELED' }); },
      listByDay: (userId, from, to) => agenda.listByDay(userId, from, to),
      cancelDay: async (userId, from, to) => (await agenda.cancelDay(userId, from, to)).count,
    },
    trainer: {
      status: (userId) => trainer.statusForChat(userId),
      completeByName: (userId, name) => trainer.completeByName(userId, name),
      ask: async (userId, question) => (await trainer.askCall(userId, question)).answer,
    },
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

  res.json({ today, training, system: { dbMs } });
}