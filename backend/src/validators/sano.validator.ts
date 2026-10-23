import { z } from 'zod';

export const commandSchema = z.object({
  message: z.string().trim().min(1, 'Digite um comando').max(500, 'Comando muito longo (máx. 500)'),
});

export const aiConfigSchema = z.object({
  apiKey: z.string().trim()
    .regex(/^sk-or-[A-Za-z0-9_-]{16,200}$/, 'Isso não parece uma chave da OpenRouter (ela começa com "sk-or-").')
    .optional(),
  model: z.string().trim().max(120).regex(/^[\w.\-/:]+$/, 'Modelo inválido').optional(),
}).refine((v) => v.apiKey || v.model, 'Informe a chave ou o modelo');

export const ttsSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  voice: z.string().max(80).regex(/^[A-Za-z]{2}-[A-Za-z]{2}-\w+$/).optional(),
  rate: z.number().min(0.5).max(2).default(1),
  pitch: z.number().min(0.5).max(1.5).default(1),
});
