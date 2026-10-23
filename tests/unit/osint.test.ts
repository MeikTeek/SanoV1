import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateIp, parseTarget, txtData } from '../../backend/src/services/osint/net';
import { NSFW_CATEGORY, SITES, USERNAME_RE, selectSites } from '../../backend/src/services/osint/sites';
import { evaluate, planSearch, usernameVariations } from '../../backend/src/services/osint/username';
import { detectTech } from '../../backend/src/services/osint/domain';
import { decode, profileSummary } from '../../backend/src/services/osint/html';
import { EMAIL_RE, gravatarUrl, usernameSuggestions } from '../../backend/src/services/osint/email';
import { handleCommand } from '../../backend/src/services/sano/router';
import type { SanoUser } from '../../backend/src/services/sano/types';

test('osint: alvo é normalizado e o domínio registrável é extraído', () => {
  const t = parseTarget('blog.exemplo.com.br/caminho');
  assert.equal(t.url, 'https://blog.exemplo.com.br/caminho');
  assert.equal(t.hostname, 'blog.exemplo.com.br');
  assert.equal(t.domain, 'exemplo.com.br');
  assert.equal(t.isIp, false);
  assert.equal(parseTarget('8.8.8.8').isIp, true);
});

test('osint: alvos internos e esquemas estranhos são recusados (anti-SSRF)', () => {
  for (const bad of ['localhost:8080', '127.0.0.1', '10.1.2.3', '192.168.0.10', '169.254.169.254', '[::1]', 'servidor.local', 'intranet', 'ftp://x.com', 'https://u:p@x.com']) {
    assert.throws(() => parseTarget(bad), undefined, bad);
  }
});

test('osint: faixas privadas IPv4/IPv6', () => {
  assert.equal(isPrivateIp('172.31.255.1'), true);
  assert.equal(isPrivateIp('172.32.0.1'), false);
  assert.equal(isPrivateIp('100.64.0.1'), true);
  assert.equal(isPrivateIp('::ffff:7f00:1'), true);
  assert.equal(isPrivateIp('::ffff:10.0.0.1'), true);
  assert.equal(isPrivateIp('fd00::1'), true);
  assert.equal(isPrivateIp('fe80::1'), true);
  assert.equal(isPrivateIp('2606:4700:4700::1111'), false);
  assert.equal(isPrivateIp('1.1.1.1'), false);
});

test('osint: TXT do DoH junta as partes', () => {
  assert.equal(txtData('"v=spf1 include:a" " -all"'), 'v=spf1 include:a -all');
  assert.equal(txtData('"tem \\"aspas\\""'), 'tem "aspas"');
});

test('osint: username aceita só caracteres seguros e NSFW fica de fora por padrão', () => {
  assert.match('fulano.silva_99', USERNAME_RE);
  for (const bad of ['a b', 'x/../y', 'a@b', '', 'x'.repeat(65)]) assert.doesNotMatch(bad, USERNAME_RE);
  assert.ok(selectSites({}).length > 800);
  assert.ok(selectSites({}).every((s) => s.category !== NSFW_CATEGORY));
  assert.ok(selectSites({ categories: ['coding'] }).every((s) => s.category === 'coding'));
});

const site = (name: string) => SITES.find((s) => s.name === name)!;
const res = (status: number, body = '', finalUrl = '') => ({ status, body, finalUrl });
const hostOf = (template: string) => new URL(template.split('{account}').join('x')).hostname.replace(/^www\./, '');

test('osint: base unificada traz WhatsMyName e Sherlock sem sites repetidos', () => {
  assert.ok(SITES.some((s) => s.source === 'wmn') && SITES.some((s) => s.source === 'sherlock'));
  const wmnHosts = new Set(SITES.filter((s) => s.source === 'wmn').map((s) => hostOf(s.profileUrl)));
  const sherlock = SITES.filter((s) => s.source === 'sherlock').map((s) => hostOf(s.profileUrl));
  assert.ok(sherlock.every((h) => !wmnHosts.has(h)), 'Sherlock só entra com o que o WhatsMyName não cobre');
});

test('osint: regras — status, mensagem, redirecionamento e WhatsMyName', () => {
  const status = SITES.find((s) => s.rule.kind === 'status')!;
  assert.equal(evaluate(status, res(200)).status, 'found');
  assert.equal(evaluate(status, res(404)).status, 'missing');
  assert.equal(evaluate(status, res(403)).status, 'unknown');

  const message = SITES.find((s) => s.rule.kind === 'message')!;
  const errorText = (message.rule as { errors: string[] }).errors[0];
  assert.equal(evaluate(message, res(200, `x ${errorText}`)).status, 'missing');
  assert.equal(evaluate(message, res(200, 'perfil de alguém')).status, 'found');

  const redirect = SITES.find((s) => s.rule.kind === 'redirect')!;
  const errorUrl = (redirect.rule as { errorUrl: string }).errorUrl;
  assert.equal(evaluate(redirect, res(200, '', errorUrl)).status, 'missing');
  assert.equal(evaluate(redirect, res(200, '', 'https://outro.exemplo/perfil')).status, 'found');

  const gh = site('GitHub (User)');
  assert.equal(evaluate(gh, res(404)).status, 'missing');
  assert.equal(evaluate(gh, res(200, 'conteúdo sem a marca esperada')).status, 'unknown');
});

test('osint: tela de desafio anti-bot nunca vira "encontrado" nem bio de perfil', () => {
  const challenge = '<html><head><title>Just a moment...</title></head><body>cf-chl</body></html>';
  const gh = site('GitHub (User)');
  const ok = (gh.rule as { eString: string }).eString;
  assert.equal(evaluate(gh, res(200, `${challenge}${ok}`)).status, 'unknown');
  assert.equal(profileSummary(challenge, 'https://x.com/u'), undefined);
  assert.equal(profileSummary('<title>Perfil de Ana</title>', 'https://x.com/u')?.title, 'Perfil de Ana');
});

test('osint: entidades HTML nomeadas e numéricas são decodificadas', () => {
  assert.equal(decode('Linus Torvalds&#x27;s Profile'), "Linus Torvalds's Profile");
  assert.equal(decode('Get&#32;the&#32;app &amp; join'), 'Get the app & join');
  assert.equal(decode('caf&eacute; &hellip;'), 'caf&eacute; …');
});

test('osint: planSearch respeita o formato aceito por cada site', () => {
  const sites = selectSites({});
  const jobs = planSearch(['a'], sites);
  assert.ok(jobs.length < sites.length, 'sites com regexCheck (ex.: mínimo de caracteres) ficam de fora');
  assert.ok(jobs.every((j) => !j.site.regex || j.site.regex.test('a')));
});

test('osint: variações de username', () => {
  const v = usernameVariations('ana.silva');
  assert.equal(v[0], 'ana.silva');
  for (const x of ['anasilva', 'ana_silva', 'ana-silva', 'asilva', 'anas']) assert.ok(v.includes(x), x);
  assert.deepEqual(usernameVariations('fulano'), ['fulano']);
  assert.ok(usernameVariations('joao99').includes('joao'));
});

test('osint: fingerprint de tecnologias', () => {
  const t = detectTech(
    { server: 'nginx/1.25', 'cf-ray': 'abc' },
    ['PHPSESSID=1'],
    '<link href="/wp-content/x.css"><script src="https://www.googletagmanager.com/gtm.js">',
  );
  assert.ok(t.CMS.includes('WordPress'));
  assert.ok(t['CDN / WAF'].includes('Cloudflare'));
  assert.ok(t['Servidor web'].includes('nginx'));
  assert.ok(t.Linguagem.includes('PHP'));
  assert.ok(t.Analytics.includes('Google Tag Manager'));
  assert.deepEqual(detectTech({}, [], '<html></html>'), {});
});

test('osint: e-mail — validação, gravatar e sugestões de username', () => {
  assert.match('ana.silva+news@exemplo.com.br', EMAIL_RE);
  for (const bad of ['sem-arroba', 'a@b', 'a b@c.com', '@c.com']) assert.doesNotMatch(bad, EMAIL_RE);
  assert.match(gravatarUrl('Teste@Exemplo.com'), /gravatar\.com\/avatar\/[0-9a-f]{32}/);
  assert.equal(gravatarUrl(' TESTE@exemplo.com '), gravatarUrl('teste@exemplo.com'));
  assert.ok(usernameSuggestions('ana.silva+news@exemplo.com').includes('anasilva'));
});

const admin: SanoUser = { id: '1', username: 'root', role: 'ADMIN', lastLoginAt: null };
const run = (text: string) => handleCommand(admin, text, { pingDb: async () => 1 }, new Date('2026-10-03T17:30:00Z'));

test('osint: comando do Sano abre o painel já com o alvo', async () => {
  assert.deepEqual((await run('abrir terminal osint')).actions, [{ type: 'navigate', to: '/osint' }]);
  assert.deepEqual((await run('osint exemplo.com.br')).actions, [{ type: 'navigate', to: '/osint?alvo=exemplo.com.br' }]);
  assert.deepEqual((await run('osint username fulano_99')).actions, [{ type: 'navigate', to: '/osint?username=fulano_99' }]);
  assert.deepEqual((await run('osint pessoa@exemplo.com')).actions, [{ type: 'navigate', to: '/osint?email=pessoa%40exemplo.com' }]);
});
