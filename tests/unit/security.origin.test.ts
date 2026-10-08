import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOrigin, isAllowedOrigin } from '../../backend/src/config/env';
import { originCheck } from '../../backend/src/middleware/security';

test('normalizeOrigin remove barra final e normaliza caixa', () => {
  assert.equal(normalizeOrigin('https://SAN0.discloud.app/'), 'https://san0.discloud.app');
  assert.equal(normalizeOrigin('http://localhost:5173/'), 'http://localhost:5173');
  assert.equal(normalizeOrigin('not-a-url'), null);
});

test('isAllowedOrigin aceita apenas origens permitidas', () => {
  assert.equal(isAllowedOrigin('https://san0.discloud.app'), true);
  assert.equal(isAllowedOrigin('https://evil.example'), false);
});

test('originCheck bloqueia request mutante com origem estranha', () => {
  let nextError: unknown = null;
  const req = {
    method: 'POST',
    headers: { origin: 'https://evil.example' },
    get: (name: string) => (name === 'origin' ? 'https://evil.example' : undefined),
  } as any;

  originCheck(req, {} as any, (err?: unknown) => {
    nextError = err;
  });

  assert.ok(nextError instanceof Error, 'deve rejeitar origem não autorizada');
  assert.match(String(nextError), /Origem não permitida|domínio/i);
});
