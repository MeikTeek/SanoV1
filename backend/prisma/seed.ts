import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { authenticator } from 'otplib';
import { encrypt } from '../src/utils/encryption';

const prisma = new PrismaClient();

async function main() {
  const username = (process.env.ADMIN_USERNAME ?? 'admin').toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error('Defina ADMIN_PASSWORD no .env');

  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) {
    console.log(`Admin "${username}" já existe. Nada a fazer.`);
    return;
  }

  await prisma.user.create({
    data: {
      username,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      role: 'ADMIN',
      mustChangePassword: true, // troca de senha + 2FA no primeiro login
    },
  });
  console.log(`Admin "${username}" criado. Faça login para trocar a senha e ativar o 2FA.`);
}

/**
 * Cria usuários extras de teste, já com senha e 2FA definidos — úteis para
 * exercitar o bate-papo (DMs, grupos) sem passar pelo fluxo de primeiro acesso.
 *
 * O segredo TOTP é derivado do nome, então é reproduzível: os testes de
 * integração geram o código a partir dele e conseguem fazer login de verdade.
 *
 * Requer TEST_SEED_PASSWORD no .env. Sem ela, nada é criado.
 */
async function seedChatUsers() {
  const password = process.env.TEST_SEED_PASSWORD;
  if (!password) return;

  const names = ['alice', 'bob'];
  for (const name of names) {
    const found = await prisma.user.findUnique({ where: { username: name } });
    if (found) continue;

    // Segredo estável por usuário: mesmo código a cada execução do seed.
    const secret = authenticator.generateSecret(name.padEnd(16, 'X'));

    await prisma.user.create({
      data: {
        username: name,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        role: 'USER',
        mustChangePassword: false,
        twoFactorEnabled: true,
        twoFactorSecret: encrypt(secret),
        displayName: name === 'alice' ? 'Alice' : 'Bob',
        bio: name === 'alice' ? 'Testando o módulo de mensagens.' : 'Oi, sou eu.',
      },
    });
    console.log(`Usuário de teste "${name}" criado (2FA ativo).`);
  }
}

/**
 * Cria o primeiro admin.
 *
 * Na hospedagem (Discloud etc.) quem roda isto é o `START`, via
 * `backend/prisma/ensure-admin.js` — um script em JS puro, porque em produção
 * só as `dependencies` estão instaladas e não há `tsx` para rodar um .ts.
 * Este arquivo continua sendo o jeito manual de criar um admin local.
 */
main()
  .then(seedChatUsers)
  .finally(() => prisma.$disconnect());
