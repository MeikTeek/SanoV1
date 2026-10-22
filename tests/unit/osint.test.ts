import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateIp, parseTarget, txtData } from '../../backend/src/services/osint/net';
import { USERNAME_RE, selectSites, NSFW_CATEGORY } from '../../backend/src/services/osint/username';
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
  assert.ok(selectSites({}).length > 500);
  assert.ok(selectSites({}).every((s) => s.cat !== NSFW_CATEGORY));
  assert.ok(selectSites({ categories: ['coding'] }).every((s) => s.cat === 'coding'));
});

const admin: SanoUser = { id: '1', username: 'root', role: 'ADMIN', lastLoginAt: null };
const run = (text: string) => handleCommand(admin, text, { pingDb: async () => 1 }, new Date('2026-10-03T17:30:00Z'));

test('osint: comando do Sano abre o painel já com o alvo', async () => {
  assert.deepEqual((await run('abrir terminal osint')).actions, [{ type: 'navigate', to: '/osint' }]);
  assert.deepEqual((await run('osint exemplo.com.br')).actions, [{ type: 'navigate', to: '/osint?alvo=exemplo.com.br' }]);
  assert.deepEqual((await run('osint username fulano_99')).actions, [{ type: 'navigate', to: '/osint?username=fulano_99' }]);
});
