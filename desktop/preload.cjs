// Única ponte entre a página do Sano e o computador: uma função que entrega a
// frase ao processo principal. Quem decide o que roda é commands.cjs.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('SanoDesktop', {
  platform: 'windows',
  version: ipcRenderer.sendSync('sano:version'),
  run: (text) => ipcRenderer.invoke('sano:run', String(text).slice(0, 300)),
});
