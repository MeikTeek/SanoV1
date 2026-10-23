/**
 * Investigação de e-mail com fontes públicas e sem chave de API.
 *
 * - Domínio: MX/provedor, se é e-mail "descartável" ou provedor gratuito.
 * - Gravatar: nome, localização, bio e contas ligadas ao e-mail (quando a pessoa criou perfil).
 * - GitHub: usuários que publicaram esse e-mail no perfil.
 * - Vazamentos: XposedOrNot (lista pública de breaches onde o e-mail apareceu).
 * - Sugestões de username a partir da parte local, para continuar na busca de username.
 */
import { createHash } from 'node:crypto';
import { CheckError, doh, getJson, stripTrailingDot, UA } from './net';
import { USERNAME_RE } from './sites';
import { usernameVariations } from './username';
import type { CheckResult } from './domain';

export const EMAIL_RE = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

const FREE_PROVIDERS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'yahoo.com', 'yahoo.com.br', 'icloud.com', 'me.com',
  'proton.me', 'protonmail.com', 'aol.com', 'bol.com.br', 'uol.com.br', 'terra.com.br', 'ig.com.br', 'zoho.com', 'gmx.com', 'yandex.com', 'mail.ru',
]);
const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'temp-mail.org', 'yopmail.com', 'trashmail.com', 'sharklasers.com',
  'getnada.com', 'dispostable.com', 'maildrop.cc', 'throwawaymail.com', 'fakeinbox.com', 'mailnesia.com', 'moakt.com',
]);

export interface EmailCheck {
  id: string;
  label: string;
  description: string;
  run: (email: string) => Promise<CheckResult>;
}

const gravatarHash = (email: string) => createHash('md5').update(email.trim().toLowerCase()).digest('hex');
export const gravatarUrl = (email: string, size = 160) => `https://gravatar.com/avatar/${gravatarHash(email)}?s=${size}&d=404`;

const domainOf = (email: string) => email.split('@')[1].toLowerCase();
const localOf = (email: string) => email.split('@')[0];

const skipped = (reason: string) => ({ skipped: reason });

const domain: EmailCheck = {
  id: 'domain',
  label: 'Domínio do e-mail',
  description: 'Servidores de e-mail, tipo de provedor e se é descartável.',
  async run(email) {
    const d = domainOf(email);
    const [mx, txt] = await Promise.all([doh(d, 'MX'), doh(d, 'TXT')]);
    if (!mx.data.length && mx.nxdomain) return { error: 'O domínio não existe — este e-mail não pode receber mensagens' };
    return {
      dominio: d,
      recebeEmail: mx.data.length > 0,
      MX: mx.data.map(stripTrailingDot),
      tipo: DISPOSABLE.has(d) ? 'descartável' : FREE_PROVIDERS.has(d) ? 'provedor gratuito' : 'domínio próprio (empresa/pessoal)',
      spf: txt.data.some((t) => /v=spf1/i.test(t)),
    };
  },
};

const gravatar: EmailCheck = {
  id: 'gravatar',
  label: 'Gravatar',
  description: 'Perfil público associado ao e-mail (nome, bio, contas ligadas).',
  async run(email) {
    const hash = gravatarHash(email);
    let data: any;
    try {
      data = await getJson<any>(`https://api.gravatar.com/v3/profiles/${hash}`, 8000);
    } catch (e) {
      if (/HTTP 404/.test((e as Error).message)) return skipped('Sem perfil Gravatar para este e-mail');
      throw e;
    }
    return {
      nome: data.display_name,
      usuario: data.profile_url?.split('/').pop(),
      localizacao: data.location,
      empresa: data.company,
      cargo: data.job_title,
      bio: data.description,
      avatar: data.avatar_url,
      perfil: data.profile_url,
      contas: (data.verified_accounts ?? data.accounts ?? []).map((a: any) => `${a.service_label ?? a.shortname ?? a.service}: ${a.url}`),
      links: (data.links ?? []).map((l: any) => `${l.label}: ${l.url}`),
    };
  },
};

const github: EmailCheck = {
  id: 'github',
  label: 'GitHub',
  description: 'Contas que publicaram este e-mail no perfil.',
  async run(email) {
    const data = await getJson<{ total_count: number; items: any[] }>(
      `https://api.github.com/search/users?q=${encodeURIComponent(`${email} in:email`)}&per_page=5`, 8000, { accept: 'application/vnd.github+json' },
    ).catch((e: Error) => { throw new CheckError(/HTTP 403|HTTP 429/.test(e.message) ? 'Limite da API do GitHub atingido — tente em 1 minuto' : e.message); });
    if (!data.total_count) return skipped('Nenhuma conta do GitHub com este e-mail público');
    return {
      total: data.total_count,
      contas: data.items.map((u) => `${u.login} (${u.type === 'Organization' ? 'organização' : 'usuário'}): ${u.html_url}`),
    };
  },
};

const breaches: EmailCheck = {
  id: 'breaches',
  label: 'Vazamentos de dados',
  description: 'Bases vazadas onde o e-mail já apareceu (XposedOrNot).',
  async run(email) {
    const res = await fetch(`https://api.xposedornot.com/v1/check-email/${encodeURIComponent(email)}`, {
      headers: { 'user-agent': UA, accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) return skipped('Este e-mail não consta nas bases de vazamento conhecidas');
    if (res.status === 429) throw new CheckError('Limite da API de vazamentos atingido — tente em instantes');
    if (!res.ok) throw new CheckError(`Serviço de vazamentos indisponível (HTTP ${res.status})`);
    const data = (await res.json()) as { breaches?: string[][] };
    const names = (data.breaches ?? []).flat();
    return names.length
      ? { total: names.length, bases: names.sort((a, b) => a.localeCompare(b)), orientacao: 'Troque a senha dos serviços listados e ative o 2FA.' }
      : skipped('Este e-mail não consta nas bases de vazamento conhecidas');
  },
};

export const EMAIL_CHECKS: EmailCheck[] = [domain, gravatar, github, breaches];

/** Sugestões de username a partir de `joao.silva+news@…` → joao.silva, joaosilva, joao_silva… */
export function usernameSuggestions(email: string): string[] {
  const local = localOf(email).split('+')[0];
  return USERNAME_RE.test(local) ? usernameVariations(local) : [];
}
