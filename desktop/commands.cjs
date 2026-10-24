/**
 * Comandos de sistema do Sano para Windows.
 *
 * Princípios de segurança:
 *  - lista branca: só roda o que está embutido aqui ou cadastrado em desktop.json;
 *  - nada de shell: os executáveis são fixos e os argumentos nunca vêm do texto;
 *  - ações que desligam ou reiniciam pedem confirmação em diálogo nativo do
 *    Windows, que o chat (ou uma IA induzida) não consegue clicar.
 */
const path = require('node:path');

const fold = (text) => text
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[?!.,;:]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/^(?:(?:ei|oi|ok|sano)[ ,]+)+/, '')
  .replace(/\s+(?:por favor|pf|pfv)$/, '');

/** Programas do Windows que existem em qualquer instalação. */
const BUILTIN_APPS = {
  'calculadora': { exe: 'calc.exe' },
  'bloco de notas': { exe: 'notepad.exe' },
  'notepad': { exe: 'notepad.exe' },
  'paint': { exe: 'mspaint.exe' },
  'gerenciador de tarefas': { exe: 'taskmgr.exe' },
  'explorador de arquivos': { exe: 'explorer.exe' },
  'explorador': { exe: 'explorer.exe' },
  'configuracoes do windows': { uri: 'ms-settings:' },
};

/** Pastas conhecidas, resolvidas pelo Electron (`app.getPath`). */
const BUILTIN_FOLDERS = {
  'downloads': 'downloads',
  'documentos': 'documents',
  'area de trabalho': 'desktop',
  'desktop': 'desktop',
  'imagens': 'pictures',
  'fotos': 'pictures',
  'musicas': 'music',
  'videos': 'videos',
};

const OPEN = /^(?:abrir|abre|abra|iniciar|inicia|inicie|executar|executa|execute)\s+(.+)$/;

/** Tira artigos e a palavra-guia ("programa", "app", "pasta"). */
function openTarget(rest) {
  const m = /^(?:(?:o|a|os|as)\s+)?(?:(programa|aplicativo|app|pasta)\s+)?(?:(?:o|a|do|da|de)\s+)?(.+)$/.exec(rest);
  const guide = m?.[1];
  return { kind: guide ? (guide === 'pasta' ? 'folder' : 'app') : null, name: (m?.[2] ?? rest).trim() };
}

/**
 * Entende a frase. Devolve null quando não é comando de sistema — aí o chat
 * segue para o servidor como sempre ("abrir ajustes", "abrir mensagens"...).
 */
function parseCommand(text, config) {
  const f = fold(text);
  if (!f) return null;

  if (/^(?:bloquear|bloqueia|bloqueie|trancar|tranca)\s+(?:a\s+|o\s+)?(?:tela|computador|pc|maquina)$/.test(f)) return { kind: 'lock' };
  if (/^(?:desligar|desliga|desligue)\s+(?:o\s+)?(?:computador|pc|maquina|notebook)$/.test(f)) return { kind: 'shutdown' };
  if (/^(?:reiniciar|reinicia|reinicie)\s+(?:o\s+)?(?:computador|pc|maquina|notebook)$/.test(f)) return { kind: 'restart' };
  if (/^(?:cancelar|cancela|cancele|abortar)\s+(?:o\s+)?(?:desligamento|reinicio|reinicializacao)$/.test(f)) return { kind: 'abort' };

  const open = OPEN.exec(f);
  if (!open) return null;
  const { kind, name } = openTarget(open[1]);
  if (!name) return null;

  const apps = { ...BUILTIN_APPS, ...Object.fromEntries(Object.entries(config.apps).map(([k, v]) => [k, { path: v }])) };
  const folders = { ...BUILTIN_FOLDERS, ...config.folders };

  if (kind !== 'folder' && apps[name]) return { kind: 'app', name, target: apps[name] };
  if (kind !== 'app' && folders[name]) return { kind: 'folder', name, target: folders[name] };
  // Com "programa/app/pasta" explícito o pedido é de sistema, mesmo sem cadastro.
  if (kind) return { kind: 'unknown', name, asked: kind };
  return null;
}

const SHUTDOWN_DELAY_S = 30;

/**
 * Executa. `deps` é injetado (spawn, shell, confirm, paths) para o módulo ser
 * testável sem Electron.
 */
async function runCommand(cmd, deps) {
  const done = (reply, ok = true) => ({ handled: true, ok, reply });

  switch (cmd.kind) {
    case 'lock':
      deps.spawn('rundll32.exe', ['user32.dll,LockWorkStation']);
      return done('Tela bloqueada.');

    case 'shutdown':
    case 'restart': {
      const restart = cmd.kind === 'restart';
      const ok = await deps.confirm(
        restart ? 'Reiniciar o computador?' : 'Desligar o computador?',
        `O Windows vai ${restart ? 'reiniciar' : 'desligar'} em ${SHUTDOWN_DELAY_S} segundos. Salve seu trabalho.`,
      );
      if (!ok) return done('Tudo bem, não mexi no computador.');
      deps.spawn('shutdown.exe', [restart ? '/r' : '/s', '/t', String(SHUTDOWN_DELAY_S)]);
      return done(`${restart ? 'Reiniciando' : 'Desligando'} em ${SHUTDOWN_DELAY_S} segundos. Diga "cancelar desligamento" para desfazer.`);
    }

    case 'abort':
      deps.spawn('shutdown.exe', ['/a']);
      return done('Desligamento cancelado, se havia algum agendado.');

    case 'app': {
      const t = cmd.target;
      if (t.exe) { deps.spawn(t.exe, []); return done(`Abrindo ${cmd.name}.`); }
      if (t.uri) { await deps.openExternal(t.uri); return done(`Abrindo ${cmd.name}.`); }
      const error = await deps.openPath(t.path);
      return error ? done(`Não consegui abrir ${cmd.name}: ${error}`, false) : done(`Abrindo ${cmd.name}.`);
    }

    case 'folder': {
      const dir = path.win32.isAbsolute(cmd.target) ? cmd.target : deps.getPath(cmd.target);
      const error = await deps.openPath(dir);
      return error ? done(`Não consegui abrir a pasta ${cmd.name}: ${error}`, false) : done(`Abrindo a pasta ${cmd.name}.`);
    }

    case 'unknown': {
      const known = [...Object.keys(BUILTIN_APPS), ...Object.keys(deps.config.apps)];
      return done(
        `Não tenho "${cmd.name}" na lista liberada. `
        + `Para liberar, edite ${deps.configFile} (apps e folders). Já posso abrir: ${known.join(', ')}.`,
        false,
      );
    }

    default:
      return { handled: false };
  }
}

module.exports = { parseCommand, runCommand, fold, BUILTIN_APPS, BUILTIN_FOLDERS, SHUTDOWN_DELAY_S };
