import { z } from 'zod';

export const passwordSchema = z
  .string()
  .min(12, 'Mínimo de 12 caracteres')
  .max(128)
  .regex(/[a-z]/, 'Precisa de letra minúscula')
  .regex(/[A-Z]/, 'Precisa de letra maiúscula')
  .regex(/\d/, 'Precisa de número')
  .regex(/[^A-Za-z0-9]/, 'Precisa de símbolo');

export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(3).max(32),
  password: z.string().min(1).max(128),
});

export const changePasswordSchema = z.object({ newPassword: passwordSchema });

export const totpSchema = z.object({ code: z.string().regex(/^\d{6}$/, 'Código deve ter 6 dígitos') });
