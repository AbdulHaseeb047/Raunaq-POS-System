import type { FastifyReply, FastifyRequest } from 'fastify';

import { appConfig } from '../../config.js';

export const ACCESS_COOKIE = 'pos_access';
export const REFRESH_COOKIE = 'pos_refresh';

const isProd = appConfig.nodeEnv === 'production';

/** Cross-site SPA (Vercel) → API (Railway) needs SameSite=None; Secure. */
function cookieBase(maxAgeSec: number) {
  return {
    path: '/',
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
    maxAge: maxAgeSec,
  };
}

function accessMaxAgeSec(): number {
  const raw = appConfig.jwt.accessExpiresIn;
  const m = /^(\d+)([smhd])$/i.exec(raw.trim());
  if (!m) return 15 * 60;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  if (unit === 's') return n;
  if (unit === 'm') return n * 60;
  if (unit === 'h') return n * 3600;
  if (unit === 'd') return n * 86400;
  return 15 * 60;
}

export function setAuthCookies(
  reply: FastifyReply,
  tokens: { accessToken: string; refreshToken: string },
): void {
  reply.setCookie(ACCESS_COOKIE, tokens.accessToken, cookieBase(accessMaxAgeSec()));
  reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, cookieBase(7 * 24 * 3600));
}

export function clearAuthCookies(reply: FastifyReply): void {
  const base = { path: '/', secure: isProd, sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax' };
  reply.clearCookie(ACCESS_COOKIE, base);
  reply.clearCookie(REFRESH_COOKIE, base);
}

export function readAccessToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ') && header.length > 7) {
    return header.slice(7);
  }
  const cookie = request.cookies?.[ACCESS_COOKIE];
  return cookie?.trim() || null;
}

export function readRefreshToken(request: FastifyRequest, bodyToken?: string): string | null {
  if (bodyToken?.trim()) return bodyToken.trim();
  const cookie = request.cookies?.[REFRESH_COOKIE];
  return cookie?.trim() || null;
}
