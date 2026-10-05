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
const { existsSync } = require('fs');

// Carrega backend/.env antes de qualquer passo.
//
// Na hospedagem as variáveis vêm do painel, então não há .env — mas em
// desenvolvimento este arquivo é o que existe, e sem carregá-lo o Prisma
// falha com "Environment variable not found: DATABASE_URL".
const ENV_FILE = path.join(__dirname, '..', 'backend', '.env');
if (existsSync(ENV_FILE)) {
  require('dotenv').config({ path: ENV_FILE });
}

const ROOT = path.resolve(__dirname, '..');
const BACKEND = path.join(ROOT, 'backend');
const SERVER = path.join(BACKEND, 'dist', 'server.js');

/**
 * Executa um passo e aborta o start se ele falhar.
 *
 * No Windows, `npx` e `npm` são scripts `.cmd`, que o Node não executa direto —
 * precisam do `shell: true`. Os argumentos aqui são literais do próprio projeto
 * (nenhum dado do usuário), então a concatenação do shell não introduz risco.
 *
 * `cwd` é a raiz do repositório: os scripts npm (`build:host`) vivem lá, e o
 * Prisma aceita o caminho do schema explicitamente.
 */
function step(label, command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
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
  // 0. Garante que o build existe.
  //
  // A hospedagem pode rodar o BUILD numa etapa separada e subir o processo a
  // partir de uma cópia limpa do repositório — onde `dist/` não está, porque
  // é gerado. Nesse caso o start caía com "server.js não encontrado".
  // Compilar aqui é idempotente: se o build já existe, não faz nada.
  if (!existsSync(SERVER)) {
    console.log('[start] build ausente; compilando agora...');
    step('build', 'npm', ['run', 'build:host']);
  }

  // 1. Banco: só aplica o que ainda não foi aplicado, então rodar sempre é seguro.
  step('migrations', 'npx', [
    'prisma', 'migrate', 'deploy',
    '--schema', path.join(BACKEND, 'prisma', 'schema.prisma'),
  ]);

  // 2. Admin: cria o ADMIN_USERNAME se ainda não existir; sai em silêncio se já existir.
  step('admin', 'node', [path.join(BACKEND, 'prisma', 'ensure-admin.js')]);

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