import type { Response, CookieOptions } from 'express';
import { env, isProd } from '../config/env';

export const COOKIE_PRE_AUTH = 'pre_auth';
export const COOKIE_SESSION = 'session';

const base = (): CookieOptions => ({
  httpOnly: true,
  secure: isProd || env.COOKIE_SAMESITE === 'none',
  sameSite: env.COOKIE_SAMESITE,
  path: '/',
});

export const setCookie = (res: Response, name: string, token: string, ttlSeconds: number) =>
  res.cookie(name, token, { ...base(), maxAge: ttlSeconds * 1000 });

export const clearAuthCookies = (res: Response) => {
  res.clearCookie(COOKIE_PRE_AUTH, base());
  res.clearCookie(COOKIE_SESSION, base());
};
