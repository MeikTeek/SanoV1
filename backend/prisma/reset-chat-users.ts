/**
 * Recria os usuários de teste `alice` e `bob` com um segredo TOTP estável.
 *
 * Existe para destravar a execução local dos testes de integração: eles fazem
 * login de verdade (com 2FA), então precisam de um segredo conhecido. O
 * `seed.ts` já faz isso na criação; este script existe para o caso de os
 * usuários já terem sido criados antes do 2FA existir no seed.
 *
 * Uso: `npx tsx prisma/reset-chat-users.ts`
 */
import 'dotenv/config';
import { createHmac } from 'crypto';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { encrypt } from '../src/utils/encryption';

const prisma = new PrismaClient();

const PASSWORD = process.env.TEST_SEED_PASSWORD ?? 'Teste#2026Abc';

/** Alfabeto base32 padrão (RFC 4648), o mesmo que o otplib usa. */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Segredo TOTP determinístico a partir do nome.
 *
 * `generateSecret` do otplib só aceita bytes aleatórios, o que quebraria a
 * reprodutibilidade dos testes. Aqui derivamos de forma estável: mesma
 * entrada → mesmo segredo → mesmo código TOTP a cada execução.
 */
function stableSecret(seed: string): string {
  const digest = createHmac('sha256', 'sano:test-seed').update(seed).digest();
  let out = '';
  for (const byte of digest) out += B32[byte % B32.length];
  return out.slice(0, 32);
}

async function main() {
  const users = [
    { username: 'alice', displayName: 'Alice', bio: 'Testando o módulo de mensagens.' },
    { username: 'bob', displayName: 'Bob', bio: 'Oi, sou eu.' },
  ];

  for (const u of users) {
    const secret = stableSecret(u.username);

    const data = {
      passwordHash: await argon2.hash(PASSWORD, { type: argon2.argon2id }),
      mustChangePassword: false,
      twoFactorEnabled: true,
      twoFactorSecret: encrypt(secret),
      displayName: u.displayName,
      bio: u.bio,
    };

    await prisma.user.upsert({
      where: { username: u.username },
      create: { username: u.username, role: 'USER' as const, ...data },
      update: data,
    });
    console.log(`"${u.username}" pronto — 2FA ativo, segredo: ${secret}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });