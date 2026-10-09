import { prisma } from '../../config/prisma';

export const MAX_BIO_LENGTH = 280;

/** Texto vazio limpa a bio; o campo é texto simples. */
export async function updateBio(userId: string, bio: string | null) {
  return prisma.user.update({
    where: { id: userId },
    data: { bio: bio?.trim() ? bio.trim() : null },
    select: { bio: true, displayName: true, avatarDataUrl: true },
  });
}

/** Registra a chave pública E2EE gerada no navegador. */
export async function setPublicKey(userId: string, publicKey: string) {
  await prisma.user.update({ where: { id: userId }, data: { chatPublicKey: publicKey } });
}
