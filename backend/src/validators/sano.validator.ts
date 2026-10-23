import { z } from 'zod';

export const commandSchema = z.object({
  message: z.string().trim().min(1, 'Digite um comando').max(500, 'Comando muito longo (máx. 500)'),
  /** Este aparelho usa IA local (LM Studio), executada pelo navegador. */
  clientAi: z.literal('local').optional(),
  /** Resposta crua da IA local para esta mesma frase. */
  aiAnswer: z.string().max(8000).optional(),
  /** A IA local falhou: segue sem ela, com o motivo. */
  aiError: z.string().max(240).optional(),
});

export const aiConfigSchema = z.object({
  apiKey: z.string().trim()
    .regex(/^sk-or-[A-Za-z0-9_-]{16,200}$/, 'Isso não parece uma chave da OpenRouter (ela começa com "sk-or-").')
    .optional(),
  model: z.string().trim().max(120).regex(/^[\w.\-/:~@]+$/, 'Modelo inválido').optional(),
}).refine((v) => v.apiKey || v.model, 'Informe a chave ou o modelo');

export const ttsSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  voice: z.string().max(80).regex(/^[A-Za-z]{2}-[A-Za-z]{2}-\w+$/).optional(),
  rate: z.number().min(0.5).max(2).default(1),
  pitch: z.number().min(0.5).max(1.5).default(1),
});

/** WAV mono 16 kHz em base64; ~20 s cabem com folga. */
export const sttSchema = z.object({
  audio: z.string().min(100).max(1_400_000).regex(/^[A-Za-z0-9+/]+=*$/, 'Áudio inválido'),
});
