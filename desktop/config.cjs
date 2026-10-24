/**
 * Configuração do app: um JSON em %APPDATA%\sano-desktop\desktop.json.
 *
 * É aqui que o usuário libera o que o Sano pode abrir. Nada fora desta lista
 * (e dos itens embutidos de commands.cjs) é executável, não importa o que o
 * chat ou a IA peçam.
 */
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_URL = 'https://san0.discloud.dev';

const DEFAULTS = {
  url: DEFAULT_URL,
  shortcut: 'Alt+Shift+S',
  // "spotify": "C:\\Users\\voce\\AppData\\Roaming\\Spotify\\Spotify.exe"
  apps: {},
  // "projetos": "C:\\Users\\voce\\Documents\\Projetos"
  folders: {},
};

/** Só aceita { nome: caminhoAbsoluto } com textos; descarta o resto em silêncio. */
function cleanMap(value) {
  const out = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [name, target] of Object.entries(value)) {
    if (typeof name === 'string' && typeof target === 'string' && path.win32.isAbsolute(target)) {
      out[name.trim().toLowerCase()] = target;
    }
  }
  return out;
}

function sanitize(raw) {
  const data = raw && typeof raw === 'object' ? raw : {};
  let url = DEFAULT_URL;
  try {
    const parsed = new URL(String(data.url ?? DEFAULT_URL));
    if (parsed.protocol === 'https:' || parsed.hostname === 'localhost') url = parsed.origin;
  } catch { /* mantém o padrão */ }
  return {
    url: process.env.SANO_URL || url,
    shortcut: typeof data.shortcut === 'string' && data.shortcut ? data.shortcut : DEFAULTS.shortcut,
    apps: cleanMap(data.apps),
    folders: cleanMap(data.folders),
  };
}

const configPath = (userDataDir) => path.join(userDataDir, 'desktop.json');

/** Lê a configuração; na primeira vez grava um modelo para o usuário editar. */
function loadConfig(userDataDir) {
  const file = configPath(userDataDir);
  try {
    return sanitize(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (err) {
    if (err.code === 'ENOENT') {
      try {
        fs.mkdirSync(userDataDir, { recursive: true });
        fs.writeFileSync(file, `${JSON.stringify(DEFAULTS, null, 2)}\n`);
      } catch { /* sem permissão: segue com o padrão */ }
    }
    return sanitize(DEFAULTS);
  }
}

module.exports = { loadConfig, sanitize, configPath, DEFAULT_URL };
