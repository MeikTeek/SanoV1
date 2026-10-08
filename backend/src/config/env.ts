import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const testEnv = process.env.NODE_ENV === 'test' && !process.env.DATABASE_URL
  ? { ...process.env, DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/sano_test' }
  : process.env;

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(8080),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET precisa ter ao menos 32 caracteres'),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY deve ter 64 caracteres hex (32 bytes)'),
  // Origem principal (CORS e checagem CSRF). Aceita barra final; quem
  // valida é `allowedOrigins`, que normaliza.
  FRONTEND_URL: z.string().url(),
  // Origens extras, separadas por vírgula. Útil quando o mesmo deploy atende
  // mais de um host (ex.: ID do discloud.config e o domínio final, ou uma
  // prévia de teste).
  FRONTEND_URLS: z.string().optional(),
  COOKIE_SAMESITE: z.enum(['strict', 'lax', 'none']).default('strict'),
  COOKIE_DOMAIN: z.string().optional(),
  APP_NAME: z.string().default('Sano'),
  // IA do módulo de treino: gateway compatível com a API da OpenAI.
  // Sem AI_API_KEY o módulo roda só com o motor determinístico.
  AI_API_KEY: z.string().optional(),
  AI_BASE_URL: z.string().url().optional(),
  AI_MODEL: z.string().default('gpt-4o-mini'),
});

const parsed = schema.safeParse(testEnv);
if (!parsed.success) {
  console.error('❌ Variáveis de ambiente inválidas:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';

/**
 * Normaliza uma URL de origem para o formato exato que o navegador manda no
 * header `Origin`: esquema + host + porta, sem barra e sem caminho.
 *
 * Por que isso existe: comparar `origin !== new URL(env.FRONTEND_URL).origin`
 * quebrava por detalhes bobos — barra final, maiúsculas, `www.`, ou o host
 * real da hospedagem diferente do `ID` do discloud.config. Tudo isso passa a
 * ser tratado aqui, num lugar só.
 */
export function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value.trim()).origin.toLowerCase();
  } catch {
    return null;
  }
}

/** Todas as origens aceitas: a principal mais as extras de `FRONTEND_URLS`. */
export const allowedOrigins: string[] = [
  ...new Set(
    [env.FRONTEND_URL, ...(env.FRONTEND_URLS ?? '').split(',')]
      .map(normalizeOrigin)
      .filter((o): o is string => o !== null),
  ),
];

/** `Origin` recebido é permitido? Usado por CORS e pela checagem CSRF. */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  const normalized = normalizeOrigin(origin);
  return normalized !== null && allowedOrigins.includes(normalized);
}
