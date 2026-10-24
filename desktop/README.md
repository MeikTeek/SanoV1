# Sano para Windows

O site do Sano numa janela própria (Electron), com ícone na bandeja, atalho global
(`Alt+Shift+S`) e comandos que rodam no computador.

## Rodar

```bash
cd desktop
npm install          # baixa o Electron (esta pasta fica fora dos workspaces de propósito)
npm start            # abre https://san0.discloud.dev
npm run dev          # abre http://localhost:5173 (precisa do `npm run dev` da raiz)
npm run dist         # gera o instalador em desktop/dist; copie para frontend/public/downloads/sano-windows.exe e atualize windows.json
```

## Comandos de sistema

| Frase | O que faz |
| --- | --- |
| `abrir calculadora`, `abrir bloco de notas`, `abrir paint`... | programas embutidos do Windows |
| `abrir downloads`, `abrir documentos`, `abrir imagens`... | pastas conhecidas |
| `abrir spotify`, `abrir pasta projetos` | itens que você liberou (abaixo) |
| `bloquear tela` | bloqueia o Windows |
| `desligar o computador`, `reiniciar o computador` | pede confirmação num diálogo do Windows; executa em 30 s |
| `cancelar desligamento` | desfaz |

Tudo o que não for comando de sistema ("abrir ajustes", "o que tenho hoje") segue para o
Sano normalmente. Com IA ligada, pedidos livres ("preciso fazer umas contas") também
chegam aqui depois que a IA os traduz.

## Liberar programas e pastas

Edite `%APPDATA%\sano-desktop\desktop.json` (menu da bandeja → "Editar configuração"):

```json
{
  "url": "https://san0.discloud.dev",
  "shortcut": "Alt+Shift+S",
  "apps": { "spotify": "C:\\Users\\voce\\AppData\\Roaming\\Spotify\\Spotify.exe" },
  "folders": { "projetos": "C:\\Users\\voce\\Documents\\Projetos" }
}
```

O arquivo é relido a cada comando; não precisa reiniciar.

## Segurança

- Lista branca: nada fora dos itens embutidos e do `desktop.json` é executado.
- Sem shell: os programas são fixos e o texto digitado nunca vira argumento.
- Desligar/reiniciar pedem confirmação num diálogo nativo, que o chat e a IA não clicam.
- Só a página do Sano (mesma origem da `url`) pode chamar `SanoDesktop.run`; links externos abrem no navegador.
- Comandos de sistema são resolvidos no próprio app e não passam pelo servidor.
- No navegador comum o servidor só explica que o comando exige o app.
