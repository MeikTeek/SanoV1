import { z } from 'zod';
import { MAX_AVATAR_BYTES } from '../services/profile.service';

export const avatarSchema = z.object({
  // Data URL completa; o serviço valida o mime pelos bytes antes de gravar.
  dataUrl: z.string().min(32).max(MAX_AVATAR_BYTES * 2),
});

export const displayNameSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, 'Mínimo de 2 caracteres')
    .max(32, 'Máximo de 32 caracteres'),
});

export const privacySchema = z.object({
  showOnlineStatus: z.boolean(),
  showActivityStatus: z.boolean(),
});