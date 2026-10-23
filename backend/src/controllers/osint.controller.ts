import type { Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../utils/errors';
import { logAudit } from '../services/audit.service';
import { CheckError, parseTarget } from '../services/osint/net';
import { DOMAIN_CHECKS, runDomainCheck } from '../services/osint/domain';
import { EMAIL_CHECKS, EMAIL_RE, gravatarUrl, usernameSuggestions } from '../services/osint/email';
import {
  USERNAME_RE, planSearch, searchUsernames, selectSites, usernameCatalog, usernameVariations, type UsernameResult,
} from '../services/osint/username';

const domainSchema = z.object({ target: z.string().trim().min(1).max(300) });
const emailSchema = z.object({ email: z.string().trim().max(254).regex(EMAIL_RE, 'E-mail inválido') });
const usernameSchema = z.object({
  usernames: z.array(z.string().trim().regex(USERNAME_RE, 'Use até 64 caracteres: letras, números, . _ -')).min(1).max(6),
  categories: z.array(z.string().max(40)).max(30).optional(),
  nsfw: z.boolean().optional(),
});

/** Uma busca de username por vez por usuário: cada uma dispara centenas de requisições. */
const runningUsername = new Set<string>();

/**
 * Resposta em NDJSON (um JSON por linha): a tela mostra cada resultado assim que
 * chega, sem esperar a varredura inteira. `signal` dispara se o cliente fechar a aba.
 */
function openStream(res: Response) {
  const ac = new AbortController();
  res.on('close', () => ac.abort());
  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no'); // Nginx: não segurar o stream no buffer
  res.flushHeaders();
  const send = (obj: unknown) => { if (!res.writableEnded) res.write(`${JSON.stringify(obj)}\n`); };
  return { send, signal: ac.signal, end: () => res.end() };
}

const maskEmail = (email: string) => `${email[0]}***@${email.split('@')[1]}`;

export function catalog(_req: Request, res: Response) {
  res.json({
    checks: DOMAIN_CHECKS.map(({ id, label, description }) => ({ id, label, description })),
    emailChecks: EMAIL_CHECKS.map(({ id, label, description }) => ({ id, label, description })),
    username: usernameCatalog(),
  });
}

export async function domainScan(req: Request, res: Response) {
  const target = parseTarget(domainSchema.parse(req.body).target);
  await logAudit(req, 'OSINT_DOMAIN_SCAN', req.user!.id, { target: target.hostname });

  const stream = openStream(res);
  stream.send({ type: 'start', target });
  await Promise.all(DOMAIN_CHECKS.map(async (c) => {
    const result = await runDomainCheck(c.id, target);
    stream.send({ type: 'check', id: c.id, result });
  }));
  stream.send({ type: 'done' });
  stream.end();
}

export async function emailScan(req: Request, res: Response) {
  const { email } = emailSchema.parse(req.body);
  await logAudit(req, 'OSINT_EMAIL_SCAN', req.user!.id, { email: maskEmail(email) });

  const stream = openStream(res);
  stream.send({ type: 'start', email, avatar: gravatarUrl(email), suggestions: usernameSuggestions(email) });
  await Promise.all(EMAIL_CHECKS.map(async (c) => {
    let result;
    try {
      result = await c.run(email);
    } catch (e) {
      result = { error: e instanceof CheckError || e instanceof Error ? e.message : 'Falha inesperada' };
    }
    stream.send({ type: 'check', id: c.id, result });
  }));
  stream.send({ type: 'done' });
  stream.end();
}

export async function usernameScan(req: Request, res: Response) {
  const input = usernameSchema.parse(req.body);
  const userId = req.user!.id;
  if (runningUsername.has(userId)) throw new AppError(409, 'Já existe uma busca de username em andamento');

  const usernames = [...new Set(input.usernames)];
  const sites = selectSites(input);
  const jobs = planSearch(usernames, sites);
  if (!jobs.length) throw new AppError(400, 'Nenhum site compatível com esse username nas categorias escolhidas');
  await logAudit(req, 'OSINT_USERNAME_SCAN', userId, { usernames, sites: sites.length, requests: jobs.length });

  runningUsername.add(userId);
  const stream = openStream(res);
  const started = Date.now();
  const tally: Record<UsernameResult['status'], number> = { found: 0, missing: 0, unknown: 0, error: 0 };
  try {
    stream.send({ type: 'start', usernames, total: jobs.length, sites: sites.length });
    await searchUsernames(jobs, (r) => {
      tally[r.status]++;
      stream.send({ type: 'result', ...r });
    }, stream.signal);
    stream.send({ type: 'done', ...tally, ms: Date.now() - started });
  } finally {
    runningUsername.delete(userId);
    stream.end();
  }
}

/** Variações sugeridas para um username (usado pela tela antes de buscar). */
export function variations(req: Request, res: Response) {
  const username = z.string().trim().regex(USERNAME_RE).parse(req.query.username);
  res.json({ variations: usernameVariations(username) });
}
