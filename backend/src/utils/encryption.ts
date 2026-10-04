import crypto from 'crypto';
import { env } from '../config/env';

const key = Buffer.from(env.ENCRYPTION_KEY, 'hex');

/** AES-256-GCM. Formato: iv:tag:dados (hex) */
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString('hex')).join(':');
}

export function decrypt(payload: string): string {
  const [iv, tag, data] = payload.split(':').map((h) => Buffer.from(h, 'hex'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
