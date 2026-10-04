import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export type TokenPurpose = 'pre_auth' | 'session';
export interface TokenPayload {
  sub: string;
  purpose: TokenPurpose;
  tv: number; // tokenVersion
}

export const PRE_AUTH_TTL = 10 * 60; // 10 min
export const SESSION_TTL = 8 * 60 * 60; // 8 h

export const signToken = (payload: TokenPayload, ttlSeconds: number) =>
  jwt.sign(payload, env.JWT_SECRET, { algorithm: 'HS256', expiresIn: ttlSeconds });

export const verifyToken = (token: string) =>
  jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as TokenPayload & jwt.JwtPayload;
