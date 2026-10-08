import { prisma } from '../../config/prisma';
import type { Prisma } from '@prisma/client';

const TOOL = 'assistant';
const KEY = 'learning';
const MAX_ITEMS = 100;
let retryAfter = 0;

interface LearningItem {
  phrase: string;
  level: 4 | 5 | 6 | 7;
  at: string;
}

function scrubPhrase(input: string): string {
  return input
    .slice(0, 500)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
    .replace(/\b(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}\b/g, '[telefone]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, '[id]')
    .replace(/\b(senha|password|token|chave)\s+\S+/gi, '$1 [redigido]')
    .replace(/\b(com|para|pra|pro|do|da|de|em|no|na)\s+([A-ZÀ-ÖØ-Þ][\p{L}'-]*(?:\s+[A-ZÀ-ÖØ-Þ][\p{L}'-]*)?)/gu, '$1 [nome]')
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, '[token]')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function recordLearningPhrase(userId: string, phrase: string, level: 4 | 5 | 6 | 7): Promise<void> {
  if (Date.now() < retryAfter) return;
  const safePhrase = scrubPhrase(phrase);
  if (!safePhrase) return;

  try {
    const row = await prisma.toolData.findUnique({
      where: { userId_tool_key: { userId, tool: TOOL, key: KEY } },
      select: { data: true },
    });
    const data = Array.isArray(row?.data) ? row.data as unknown as LearningItem[] : [];
    const normalized = safePhrase.toLowerCase();
    const next = [
      { phrase: safePhrase, level, at: new Date().toISOString() },
      ...data.filter((item) => item.phrase.toLowerCase() !== normalized),
    ].slice(0, MAX_ITEMS);
    const json: Prisma.InputJsonArray = next.map<Prisma.InputJsonObject>((item) => ({
      phrase: item.phrase,
      level: item.level,
      at: item.at,
    }));
    await prisma.toolData.upsert({
      where: { userId_tool_key: { userId, tool: TOOL, key: KEY } },
      create: { userId, tool: TOOL, key: KEY, data: json },
      update: { data: json },
    });
  } catch {
    retryAfter = Date.now() + 60_000;
    console.error('[assistant] não foi possível registrar uma frase para revisão administrativa.');
  }
}

export async function listLearningPhrases(): Promise<LearningItem[]> {
  const rows = await prisma.toolData.findMany({
    where: { tool: TOOL, key: KEY },
    select: { data: true },
    orderBy: { updatedAt: 'desc' },
    take: 200,
  });
  return rows
    .flatMap((row) => Array.isArray(row.data) ? row.data as unknown as LearningItem[] : [])
    .slice(0, MAX_ITEMS);
}
