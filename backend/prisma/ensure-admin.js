/**
 * Garante que exista um administrador — roda sozinho, no start da hospedagem.
 *
 * Por que existe: hospedagens de processo único (Discloud, Railway, Render)
 * não dão acesso a terminal, então não dá para rodar `npm run db:seed`
 * manualmente depois do deploy. Este script roda dentro do START, antes do
 * servidor subir.
 *
 * É idempotente: se o admin já existe, não faz nada. Pode rodar em todo boot.
 *
 * JavaScript puro (não TypeScript) de propósito: em produção só as
 * `dependencies` estão instaladas — `tsx`, que roda os scripts .ts, não está lá.
 */
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');

const prisma = new PrismaClient();

async function main() {
  const username = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    // Sem isso não dá para criar ninguém. Não derruba o servidor: pode ser um
    // deploy de atualização, e o admin já existir de antes.
    console.warn('[admin] ADMIN_PASSWORD não definida — pulando criação do admin.');
    return;
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log(`[admin] "${username}" já existe.`);
    return;
  }

  await prisma.user.create({
    data: {
      username,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      role: 'ADMIN',
      // Troca de senha e 2FA são obrigatórios no primeiro acesso.
      mustChangePassword: true,
    },
  });

  console.log(`[admin] "${username}" criado. Faça login e ative o 2FA.`);
}

main()
  .catch((err) => {
    // Falhou de verdade (banco fora do ar, por exemplo): o start deve parar,
    // senão o servidor sobe sem admin e ninguém entende o motivo depois.
    console.error('[admin] falha ao garantir o admin:', err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());