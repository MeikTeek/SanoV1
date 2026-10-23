import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base } from '../../frontend/src/ai/localAi';

test('endereço do LM Studio sem /v1 é completado', () => {
  assert.equal(base('http://127.0.0.1:1234'), 'http://127.0.0.1:1234/v1');
  assert.equal(base(' http://localhost:1234/ '), 'http://localhost:1234/v1');
  assert.equal(base('http://localhost:1234/v1/'), 'http://localhost:1234/v1');
  assert.equal(base('http://localhost:8080/api/v1'), 'http://localhost:8080/api/v1');
});
