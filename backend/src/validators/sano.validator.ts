import { z } from 'zod';

export const commandSchema = z.object({
  message: z.string().trim().min(1, 'Digite um comando').max(500, 'Comando muito longo (máx. 500)'),
});