/**
 * Entry point da hospedagem (Discloud, Railway, Render...).
 *
 * Por que este arquivo existe: o `MAIN` da hospedagem precisa apontar para um
 * arquivo que EXISTA no repositório — a plataforma empacota o código em um zip
 * e procura esse caminho antes de rodar qualquer coisa. Como `dist/` está no
 * `.gitignore` (o build é gerado na máquina da hospedagem), o
 * `backend/dist/server.js` simplesmente não existe ainda no zip.
 *
 * A saída é esta: `MAIN=src/index.js`, um arquivo versionado que só existe para
 * ser o ponto de entrada. Ele roda o que o processo realmente precisa:
 *
 *   1. aplica as migrations do banco
 *   2. garante que exista um administrador
 *   3. carrega o servidor compilado (backend/dist/server.js), que sobe o Express
 *
 * JavaScript puro, sem dependência de build.
 */
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BACKEND = path.join(ROOT, 'backend');
const SERVER = path.join(BACKEND, 'dist', 'server.js');

/**
 * Executa um passo e aborta o start se ele falhar.
 *
 * No Windows, `npx` é um script `.cmd`, que o Node não executa direto — precisa
 * do `shell: true`. Os argumentos aqui são literais do próprio projeto (nenhum
 * dado do usuário), então a concatenação do shell não introduz risco.
 */
function step(label, command, args) {
  const result = spawnSync(command, args, {
    cwd: BACKEND,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error) {
    console.error(`[start] ${label}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[start] ${label} falhou (código ${result.status}).`);
    process.exit(result.status || 1);
  }
}

function main() {
  // 1. Banco: só aplica o que ainda não foi aplicado, então rodar sempre é seguro.
  step('migrations', 'npx', ['prisma', 'migrate', 'deploy']);

  // 2. Admin: cria o ADMIN_USERNAME se ainda não existir; sai em silêncio se já existir.
  step('admin', 'node', ['prisma/ensure-admin.js']);

  // 3. Servidor. Se o BUILD não rodou, falhar aqui é melhor do que subir uma
  //    API sem o frontend — e a mensagem diz exatamente o que fazer.
  try {
    require(SERVER);
  } catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND') {
      console.error('[start] backend/dist/server.js não encontrado.');
      console.error('        O build não rodou? Verifique o comando BUILD no discloud.config.');
    } else {
      console.error('[start] falha ao carregar o servidor:', err && err.message);
    }
    process.exit(1);
  }
}

main();