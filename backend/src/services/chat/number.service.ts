/**
 * "Número" do usuário no bate-papo — o equivalente ao telefone no WhatsApp.
 *
 * Ideia: cada pessoa tem um código de 8 caracteres que só é válido por uma
 * janela de `NUMBER_WINDOW_MS` (15 horas). Quem recebe o código por qualquer
 * canal confiável (presencial, áudio, etc.) consegue iniciar uma conversa
 * direta sem precisar conhecer o `@username`.
 *
 * Propriedades de segurança:
 * - O código é **derivado** (HMAC-SHA256) do id do usuário + o índice da
 *   janela. O segredo fica no servidor (`CHAT_NUMBER_SECRET`), então mesmo
 *   vazando o banco o código não é reproduzível fora da janela.
 * - Não é credencial: quem tem o código só abre a conversa; para ler as
 *   mensagens precisa da chave E2EE do dono. Ainda assim, por ser revogável
 *   (basta trocar a semente), a rota de busca é limitada por rate limit.
 * - A semente por usuário impede que dois usuários escolham o mesmo código.
 */
import crypto from 'crypto';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/errors';

/** Janela de validade do código: 15 horas. */
export const NUMBER_WINDOW_MS = 15 * 60 * 60 * 1000;

/** Alfabeto sem caracteres ambíguos (0/O, 1/I/L) — o código é ditado ao telefone. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LEN = 8;

/**
 * Semente global do módulo. Cai para o JWT_SECRET quando a variável dedicada
 * não existe, para não quebrar deploys que ainda não a definiram.
 */
function masterSeed(): Buffer {
  const raw = (env as unknown as Record<string, string | undefined>).CHAT_NUMBER_SECRET ?? env.JWT_SECRET;
  return crypto.createHash('sha256').update(raw).digest();
}

/** Índice da janela de 15h que contém `at`. */
export const windowIndex = (at: Date = new Date()) => Math.floor(at.getTime() / NUMBER_WINDOW_MS);

/** Quando a janela atual expira. */
export const windowEndsAt = (at: Date = new Date()) =>
  new Date((windowIndex(at) + 1) * NUMBER_WINDOW_MS);

/** Segredo do usuário: estável enquanto a semente não muda. */
function userSeed(userId: string): Buffer {
  return crypto.createHmac('sha256', masterSeed()).update(`sano:number:${userId}`).digest();
}

/**
 * Código de `userId` na janela `index`. Determinístico: o mesmo par
 * (usuário, janela) sempre gera o mesmo código — é o que permite validar
 * sem guardar nada além do próprio código vigente.
 */
export function deriveNumber(userId: string, index: number = windowIndex()): string {
  const mac = crypto.createHmac('sha256', userSeed(userId)).update(String(index)).digest();
  let code = '';
  for (let i = 0; code.length < CODE_LEN; i++) {
    // Percorre o HMAC em blocos: 1 byte não cobre 32^8, o digest inteiro dá
    // espaço suficiente e mantém o código uniforme.
    code += ALPHABET[mac[i % mac.length] % ALPHABET.length];
  }
  return code.slice(0, CODE_LEN);
}

/** Formatação para leitura: `ABCD-2345`. */
export const formatNumber = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

/**
 * Aceita o que a pessoa digitar ("abcd-2345", "ABCD 2345", "abcd2345") e
 * devolve o código canônico. Lança 400 no que não couber no formato.
 */
export function normalizeNumber(input: string): string {
  const clean = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length !== CODE_LEN) {
    throw new AppError(400, `O código tem ${CODE_LEN} caracteres (ex.: ABCD-2345)`);
  }
  for (const ch of clean) {
    if (!ALPHABET.includes(ch)) {
      throw new AppError(400, 'Código inválido — não usamos 0, O, 1, I nem L');
    }
  }
  return clean;
}

export interface MyNumber {
  code: string;
  formatted: string;
  /** Epoch ms em que o código deixa de valer. */
  expiresAt: string;
  /** Segundos restantes na janela atual. */
  expiresInSeconds: number;
  windowHours: number;
}

/**
 * Devolve (e renova, se preciso) o número do usuário. O número é gravado em
 * colunas para permitir busca por código único; aExpiry garante que Codes
 * antigos nunca são aceitos.
 */
export async function myNumber(userId: string): Promise<MyNumber> {
  const now = new Date();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { chatNumber: true, chatNumberUntil: true },
  });

  const { chatNumber, chatNumberUntil } = user;
  // Só reaproveita o número guardado se ele ainda estiver dentro da janela.
  if (chatNumber && chatNumberUntil && chatNumberUntil > now) {
    return pack(chatNumber, chatNumberUntil);
  }

  // Recalcula. A semente é estável, então o código muda só ao virar a janela.
  const code = deriveNumber(userId);
  const until = windowEndsAt(now);
  await prisma.user.update({
    where: { id: userId },
    data: { chatNumber: code, chatNumberUntil: until },
  });
  return pack(code, until);
}

function pack(code: string, until: Date): MyNumber {
  return {
    code,
    formatted: formatNumber(code),
    expiresAt: until.toISOString(),
    expiresInSeconds: Math.max(0, Math.floor((until.getTime() - Date.now()) / 1000)),
    windowHours: NUMBER_WINDOW_MS / 3_600_000,
  };
}

/**
 * Resolve um código digitado para um usuário ativo.
 *
 * A busca é pela coluna única `chatNumber` e só aceita o código cujo
 * `chatNumberUntil` ainda não passou — é o que "expira" o número a cada 15h.
 */
export async function resolveNumber(input: string) {
  const code = normalizeNumber(input);
  const user = await prisma.user.findUnique({ where: { chatNumber: code } });

  if (!user || !user.chatNumberUntil || user.chatNumberUntil <= new Date()) {
    // Mensagem genérica de propósito: não confirma se o código existiu.
    throw new AppError(404, 'Código inválido ou expirado');
  }
  if (!user.active) throw new AppError(403, 'Usuário indisponível');
  return user;
}