import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { AppError } from '../utils/errors';

const EXPIRATION_MS = 24 * 60 * 60 * 1000;
const bucket = env.MUSIC_STORAGE_BUCKET;
const storage = env.MUSIC_STORAGE_ENDPOINT && bucket && env.MUSIC_STORAGE_ACCESS_KEY && env.MUSIC_STORAGE_SECRET_KEY
  ? new S3Client({
    region: env.MUSIC_STORAGE_REGION,
    endpoint: env.MUSIC_STORAGE_ENDPOINT,
    forcePathStyle: true,
    credentials: { accessKeyId: env.MUSIC_STORAGE_ACCESS_KEY, secretAccessKey: env.MUSIC_STORAGE_SECRET_KEY },
  })
  : null;

function requireStorage() {
  if (!storage || !bucket) throw new AppError(503, 'Compartilhamento de músicas não está configurado.');
  return { client: storage, bucket };
}

function hashCode(code: string) {
  return createHash('sha256').update(code).digest('hex');
}

export async function createShare(userId: string, size: number) {
  const { client, bucket: targetBucket } = requireStorage();
  if (!Number.isInteger(size) || size <= 0 || size > 500 * 1024 * 1024) {
    throw new AppError(400, 'O pacote deve ter entre 1 byte e 500 MB.');
  }
  const code = randomBytes(5).toString('hex').toUpperCase();
  const objectKey = `music-shares/${randomBytes(20).toString('hex')}.zip`;
  const expiresAt = new Date(Date.now() + EXPIRATION_MS);
  const share = await prisma.musicShare.create({ data: { ownerId: userId, codeHash: hashCode(code), objectKey, expiresAt } });
  const uploadUrl = await getSignedUrl(client, new PutObjectCommand({ Bucket: targetBucket, Key: objectKey, ContentType: 'application/zip' }), { expiresIn: 900 });
  return { id: share.id, code, uploadUrl, expiresAt };
}

export async function finalizeShare(userId: string, id: string) {
  const { client, bucket: targetBucket } = requireStorage();
  const share = await prisma.musicShare.findFirst({ where: { id, ownerId: userId, status: 'PENDING' } });
  if (!share || share.expiresAt <= new Date()) throw new AppError(404, 'Compartilhamento expirado ou inexistente.');
  await client.send(new HeadObjectCommand({ Bucket: targetBucket, Key: share.objectKey }));
  await prisma.musicShare.update({ where: { id }, data: { status: 'READY' } });
}

export async function claimShare(code: string) {
  const { client, bucket: targetBucket } = requireStorage();
  const share = await prisma.musicShare.findFirst({ where: { codeHash: hashCode(code.trim().toUpperCase()), status: 'READY' } });
  if (!share || share.expiresAt <= new Date()) throw new AppError(404, 'Código inválido, expirado ou já utilizado.');
  await prisma.musicShare.update({ where: { id: share.id }, data: { status: 'CLAIMED', claimedAt: new Date() } });
  const downloadUrl = await getSignedUrl(client, new GetObjectCommand({ Bucket: targetBucket, Key: share.objectKey, ResponseContentType: 'application/zip' }), { expiresIn: 900 });
  return { downloadUrl, expiresAt: share.expiresAt };
}

export async function removeExpiredShares() {
  if (!storage || !bucket) return;
  const expired = await prisma.musicShare.findMany({ where: { expiresAt: { lt: new Date() }, status: { not: 'CLAIMED' } }, select: { id: true, objectKey: true } });
  for (const share of expired) {
    await storage.send(new DeleteObjectCommand({ Bucket: bucket, Key: share.objectKey }));
    await prisma.musicShare.delete({ where: { id: share.id } });
  }
}
