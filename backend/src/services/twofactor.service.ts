import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import type { User } from '@prisma/client';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { encrypt, decrypt } from '../utils/encryption';

authenticator.options = { window: 1 }; // tolera 30s de diferença de relógio

export async function generateTwoFactorSetup(user: User) {
  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(user.username, env.APP_NAME, secret);
  const qrCode = await QRCode.toDataURL(otpauth);
  await prisma.user.update({ where: { id: user.id }, data: { twoFactorSecret: encrypt(secret) } });
  return { otpauth, qrCode, secret };
}

export function verifyTotp(user: User, code: string): boolean {
  if (!user.twoFactorSecret) return false;
  try {
    return authenticator.check(code, decrypt(user.twoFactorSecret));
  } catch {
    return false;
  }
}
