import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors';

/** O body-parser lança SyntaxError com a propriedade `body` quando o JSON não parseia. */

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) return res.status(err.status).json({ error: err.message });
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Dados inválidos', details: err.flatten().fieldErrors });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Corpo da requisição deve ser JSON válido' });
  }
  console.error(err);
  return res.status(500).json({ error: 'Erro interno do servidor' });
}
