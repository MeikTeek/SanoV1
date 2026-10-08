# Backup of originCheck middleware

```typescript
import type { Request, Response, NextFunction } from 'express';
import { env, isAllowedOrigin, normalizeOrigin } from '../config/env';
import { AppError } from '../utils/errors';

/** Proteção CSRF extra: métodos que alteram dados só aceitos se a Origin for a do frontend. */
export function originCheck(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  let origin = req.get('origin');
  if (!origin) {
    // Fallback: construct origin from protocol and host (useful when browser omits Origin header on same‑origin requests)
    const protocol = req.protocol; // 'http' or 'https'
    const host = req.get('host') ?? '';
    origin = `${protocol}://${host}`;
  }
  if (!isAllowedOrigin(origin)) {
    throw new AppError(403, 'Origem não permitida');
  }
  next();
}
```