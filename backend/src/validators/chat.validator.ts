import { z } from 'zod';
import { MAX_GROUP_MEMBERS, MAX_GROUP_NAME } from '../services/chat/conversation.service';
import { MAX_BIO_LENGTH } from '../services/chat/profile-data.service';

const uuid = z.string().uuid();

export const numberParamSchema = z.object({
  /** Formato solto: o serviço normaliza ("abcd-2345", "ABCD 2345", ...). */
  number: z.string().min(4).max(16),
});

export const conversationParamSchema = z.object({ id: uuid });

export const profileParamsSchema = z.object({
  username: z.string().min(2).max(40),
});

export const openDirectSchema = z.object({ number: z.string().min(4).max(16) });

export const createGroupSchema = z.object({
  name: z.string().trim().min(1, 'Dê um nome ao grupo').max(MAX_GROUP_NAME),
  // Cada convite usa um código de usuário, não o diretório público.
  invitees: z.array(z.string().trim().min(1).max(40))
    .min(1, 'Convide pelo menos uma pessoa')
    .max(MAX_GROUP_MEMBERS),
});

export const addMemberSchema = z.object({ userId: uuid });

/**
 * O envelope é um objeto opaco: o servidor só verifica o formato mínimo e que
 * existe uma cópia por participante. O conteúdo já vem cifrado do navegador.
 */
export const sendMessageSchema = z.object({
  clientId: z.string().uuid().optional(),
  kind: z.enum(['TEXT', 'IMAGE', 'AUDIO']).default('TEXT'),
  envelope: z.object({
    /** Chave pública efêmera do remetente (SPKI base64). */
    epk: z.string().min(16).max(512),
    /** Uma entrada por participante: { iv, ct } em base64. */
    copies: z.record(z.string(), z.object({
      iv: z.string().min(8).max(64),
      ct: z.string().min(1).max(400_000),
    })),
  }).refine((e) => Object.keys(e.copies).length > 0, 'Envelope sem cópia para ninguém'),
  /** Metadados de exibição (não sensíveis): mime, tamanho, duração. */
  meta: z.object({
    mime: z.string().max(80).optional(),
    bytes: z.number().int().min(0).max(2_000_000).optional(),
    seconds: z.number().min(0).max(600).optional(),
    width: z.number().int().min(0).max(20_000).optional(),
    height: z.number().int().min(0).max(20_000).optional(),
  }).nullish(),
});

export const listMessagesQuerySchema = z.object({
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const updateBioSchema = z.object({
  bio: z.string().trim().max(MAX_BIO_LENGTH, `Máximo de ${MAX_BIO_LENGTH} caracteres`),
});

export const setPublicKeySchema = z.object({
  /** SPKI da chave ECDH P-256 em base64. */
  publicKey: z.string().min(40).max(512),
});

export const friendRequestResponseSchema = z.object({
  status: z.enum(['ACCEPTED', 'REJECTED']),
});

export const presenceSchema = z.object({
  activity: z.enum([
    'Conversando com Sano',
    'Usando a agenda',
    'Visualizando treino',
    'No chat',
    'Digitando no chat',
    'Nas configurações',
    'Lendo informações',
    'Na administração',
  ]),
});