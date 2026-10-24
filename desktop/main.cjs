/**
 * Sano Desktop: abre o site do Sano numa janela própria, com ícone na bandeja,
 * atalho global e os comandos de sistema de commands.cjs.
 */
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, shell, dialog, nativeImage } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { loadConfig, configPath } = require('./config.cjs');
const { parseCommand, runCommand } = require('./commands.cjs');

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
let tray = null;
let quitting = false;
let config;

const appOrigin = () => new URL(config.url).origin;

function openInBrowser(url) {
  try {
    const { protocol } = new URL(url);
    if (protocol === 'https:' || protocol === 'http:') shell.openExternal(url);
  } catch { /* ignora */ }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180, height: 780, minWidth: 420, minHeight: 520,
    backgroundColor: '#0b0f14',
    title: 'Sano',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadURL(config.url);

  // Sem rede ou endereço errado: mostra o motivo e tenta de novo, em vez de tela preta.
  win.webContents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 /* navegação cancelada */ || url.startsWith('file:')) return;
    win.loadFile(path.join(__dirname, 'offline.html'), { query: { url: config.url, why: `${desc} (${code})` } });
  });

  // Servidor fora do ar (502, 503...): a página "carrega", mas é só o aviso do host.
  win.webContents.on('did-navigate', (_e, url, httpCode) => {
    if (httpCode >= 500 && !url.startsWith('file:')) {
      win.loadFile(path.join(__dirname, 'offline.html'), { query: { url: config.url, why: `o servidor respondeu ${httpCode}` } });
    }
  });

  if (process.env.SANO_DEBUG) {
    win.webContents.on('did-fail-load', (_e, code, desc, url) => console.log('[fail-load]', code, desc, url));
    win.webContents.on('console-message', (_e, level, message) => console.log('[console]', level, message));
    win.webContents.on('render-process-gone', (_e, d) => console.log('[gone]', d.reason));
    win.webContents.on('did-finish-load', () => console.log('[loaded]', win.webContents.getURL()));
    win.webContents.on('preload-error', (_e, p, err) => console.log('[preload-error]', err));
  }

  // Só o site do Sano fica dentro da janela; o resto abre no navegador padrão.
  win.webContents.setWindowOpenHandler(({ url }) => { openInBrowser(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (event, url) => {
    // A tela de erro (file:) volta ao Sano sozinha; qualquer outro site abre fora.
    if (new URL(url).origin === appOrigin() || event.sender.getURL().startsWith('file:')) return;
    event.preventDefault();
    openInBrowser(url);
  });

  // Fechar esconde na bandeja; sair é pelo menu da bandeja.
  win.on('close', (event) => {
    if (!quitting) { event.preventDefault(); win.hide(); }
  });
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

const toggleWindow = () => (win?.isVisible() && win.isFocused() ? win.hide() : showWindow());

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('Sano');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir Sano', click: showWindow },
    { label: 'Editar configuração (endereço, apps e pastas)', click: () => shell.openPath(configPath(app.getPath('userData'))) },
    { type: 'separator' },
    { label: 'Sair', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', toggleWindow);
}

/** Só a própria página do Sano pode pedir comandos (nunca um site externo). */
function fromSano(event) {
  try { return new URL(event.senderFrame.url).origin === appOrigin(); } catch { return false; }
}

function registerIpc() {
  ipcMain.on('sano:version', (event) => { event.returnValue = fromSano(event) ? app.getVersion() : ''; });

  ipcMain.handle('sano:run', async (event, text) => {
    if (!fromSano(event) || typeof text !== 'string') return { handled: false };
    // O arquivo é relido a cada pedido: editar o desktop.json vale na hora.
    config = loadConfig(app.getPath('userData'));
    const cmd = parseCommand(text, config);
    if (!cmd) return { handled: false };
    return runCommand(cmd, {
      config,
      configFile: configPath(app.getPath('userData')),
      spawn: (exe, args) => spawn(exe, args, { detached: true, stdio: 'ignore', shell: false }).unref(),
      openPath: (target) => shell.openPath(target),
      openExternal: (uri) => shell.openExternal(uri),
      getPath: (name) => app.getPath(name),
      confirm: async (message, detail) => {
        showWindow();
        const { response } = await dialog.showMessageBox(win, {
          type: 'warning', buttons: ['Sim', 'Cancelar'], defaultId: 1, cancelId: 1,
          title: 'Sano', message, detail,
        });
        return response === 0;
      },
    });
  });
}

app.on('second-instance', showWindow);

app.whenReady().then(() => {
  config = loadConfig(app.getPath('userData'));
  registerIpc();
  createWindow();
  createTray();
  if (!globalShortcut.register(config.shortcut, toggleWindow)) {
    console.warn(`[sano] atalho ${config.shortcut} indisponível`);
  }
});

app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { /* continua na bandeja */ });
