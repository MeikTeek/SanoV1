import type { Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../utils/errors';
import { logAudit } from '../services/audit.service';
import { parseTarget } from '../services/osint/net';
import { DOMAIN_CHECKS, runDomainCheck } from '../services/osint/domain';
import { USERNAME_RE, searchUsername, selectSites, usernameCatalog, type UsernameResult } from '../services/osint/username';

const domainSchema = z.object({ target: z.string().trim().min(1).max(300) });
const usernameSchema = z.object({
  username: z.string().trim().regex(USERNAME_RE, 'Use até 64 caracteres: letras, números, . _ -'),
  categories: z.array(z.string().max(40)).max(30).optional(),
  nsfw: z.boolean().optional(),
});

/** Uma busca de username por vez por usuário: cada uma dispara ~650 requisições. */
const runningUsername = new Set<string>();

/**
 * Resposta em NDJSON (um JSON por linha): a tela mostra cada resultado assim que
 * chega, sem esperar a varredura inteira. `abort` dispara se o cliente fechar a aba.
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

export function catalog(_req: Request, res: Response) {
  res.json({
    checks: DOMAIN_CHECKS.map(({ id, label, description }) => ({ id, label, description })),
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

export async function usernameScan(req: Request, res: Response) {
  const input = usernameSchema.parse(req.body);
  const userId = req.user!.id;
  if (runningUsername.has(userId)) throw new AppError(409, 'Já existe uma busca de username em andamento');

  const sites = selectSites(input);
  if (!sites.length) throw new AppError(400, 'Nenhum site nas categorias escolhidas');
  await logAudit(req, 'OSINT_USERNAME_SCAN', userId, { username: input.username, sites: sites.length });

  runningUsername.add(userId);
  const stream = openStream(res);
  const tally: Record<UsernameResult['status'], number> = { found: 0, missing: 0, unknown: 0, error: 0 };
  try {
    stream.send({ type: 'start', username: input.username, total: sites.length });
    await searchUsername(input.username, sites, (r) => {
      tally[r.status]++;
      stream.send({ type: 'result', ...r });
    }, stream.signal);
    stream.send({ type: 'done', ...tally });
  } finally {
    runningUsername.delete(userId);
    stream.end();
  }
}
