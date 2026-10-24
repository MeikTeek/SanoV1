import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { handleCommand } from '../../backend/src/services/sano/router';
import { clearAssistantMemoryForTests } from '../../backend/src/services/sano/context.service';

process.env.NODE_ENV = 'test';
const require = createRequire(import.meta.url);
const { parseCommand, runCommand } = require('../../desktop/commands.cjs');
const { sanitize } = require('../../desktop/config.cjs');

const config = sanitize({
  apps: { spotify: 'C:\\Spotify\\Spotify.exe', relativo: 'spotify.exe' },
  folders: { projetos: 'C:\\Projetos' },
});

function fakeDeps(confirmAnswer = true) {
  const calls: unknown[][] = [];
  return {
    calls,
    deps: {
      config, configFile: 'C:\\x\\desktop.json',
      spawn: (...a: unknown[]) => { calls.push(['spawn', ...a]); },
      openPath: async (p: string) => { calls.push(['openPath', p]); return ''; },
      openExternal: async (u: string) => { calls.push(['openExternal', u]); },
      getPath: (n: string) => `C:\\Users\\x\\${n}`,
      confirm: async () => confirmAnswer,
    },
  };
}

test('config: só caminhos absolutos entram na lista liberada', () => {
  assert.deepEqual(Object.keys(config.apps), ['spotify']);
  assert.deepEqual(Object.keys(config.folders), ['projetos']);
});

test('parse: comandos de sistema e itens liberados', () => {
  assert.equal(parseCommand('Sano, bloquear a tela', config).kind, 'lock');
  assert.equal(parseCommand('desligar o computador', config).kind, 'shutdown');
  assert.equal(parseCommand('abrir a calculadora por favor', config).name, 'calculadora');
  assert.equal(parseCommand('abrir spotify', config).target.path, 'C:\\Spotify\\Spotify.exe');
  assert.equal(parseCommand('abrir pasta projetos', config).kind, 'folder');
  assert.equal(parseCommand('abrir downloads', config).kind, 'folder');
});

test('parse: o que não é de sistema segue para o servidor', () => {
  assert.equal(parseCommand('abrir ajustes', config), null);
  assert.equal(parseCommand('abrir mensagens', config), null);
  assert.equal(parseCommand('o que tenho hoje', config), null);
  assert.equal(parseCommand('abrir cmd.exe', config), null);
});

test('execução: abre pela lista, sem shell e sem texto livre nos argumentos', async () => {
  const { calls, deps } = fakeDeps();
  await runCommand(parseCommand('abrir calculadora', config), deps);
  await runCommand(parseCommand('abrir spotify', config), deps);
  await runCommand(parseCommand('abrir downloads', config), deps);
  assert.deepEqual(calls, [
    ['spawn', 'calc.exe', []],
    ['openPath', 'C:\\Spotify\\Spotify.exe'],
    ['openPath', 'C:\\Users\\x\\downloads'],
  ]);
});

test('item fora da lista não executa nada e orienta a liberar', async () => {
  const { calls, deps } = fakeDeps();
  const r = await runCommand(parseCommand('abrir programa malware', config), deps);
  assert.equal(r.ok, false);
  assert.match(r.reply, /desktop\.json/);
  assert.equal(calls.length, 0);
});

test('desligar exige confirmação nativa; recusa não faz nada', async () => {
  const no = fakeDeps(false);
  await runCommand(parseCommand('desligar o pc', config), no.deps);
  assert.equal(no.calls.length, 0);
  const yes = fakeDeps(true);
  await runCommand(parseCommand('desligar o pc', config), yes.deps);
  assert.deepEqual(yes.calls, [['spawn', 'shutdown.exe', ['/s', '/t', '30']]]);
});

test('no navegador, o servidor só explica e nunca executa', async () => {
  clearAssistantMemoryForTests();
  const user = { id: 'sys-1', username: 'ana', role: 'USER' as const, lastLoginAt: null };
  const r = await handleCommand(user, 'abrir calculadora', { pingDb: async () => 1 });
  assert.equal(r.intent, 'sistema');
  assert.match(r.reply, /app Sano para Windows/);
  assert.equal(r.actions, undefined);
});

test('IA que devolve comando de sistema manda o navegador executar', async () => {
  clearAssistantMemoryForTests();
  const user = { id: 'sys-2', username: 'ana', role: 'USER' as const, lastLoginAt: null };
  const r = await handleCommand(user, 'preciso fazer umas contas rapidinho', {
    pingDb: async () => 1,
    ai: async () => ({ ok: true, command: 'abrir calculadora' }),
  });
  assert.deepEqual(r.actions, [{ type: 'run', command: 'abrir calculadora' }]);
});
