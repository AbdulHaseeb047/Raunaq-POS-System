import { createHash, randomBytes } from 'node:crypto';

import type { FeatureKey, UserRole } from '@pos/shared';
import { USER_ROLES } from '@pos/shared';
import * as argon2 from 'argon2';
import type { FastifyInstance } from 'fastify';
import type { SignOptions } from 'jsonwebtoken';
import jwt from 'jsonwebtoken';

import { appConfig } from '../../config.js';
import { UnauthorizedError, ValidationError } from '../core/errors.js';
import { prisma } from '../core/prisma.js';
import type { AuthenticatedUser } from '../../types/fastify.js';
import { resolveUserFeatures } from '../permissions/permissions.service.js';
import { assertTenantPortalAccess } from '../tenants/subscription.service.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: AuthenticatedUser;
  mustChangePassword: boolean;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

function signAccessToken(user: AuthenticatedUser): string {
  return jwt.sign(
    {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      features: user.features,
      mustChangePassword: user.mustChangePassword,
    },
    appConfig.jwt.secret,
    { expiresIn: appConfig.jwt.accessExpiresIn as SignOptions['expiresIn'] },
  );
}

export async function buildAuthenticatedUser(userId: string): Promise<AuthenticatedUser> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null, isActive: true },
  });

  if (!user) {
    throw new UnauthorizedError('User not found or inactive');
  }

  const features = await resolveUserFeatures(user.id, user.role, user.tenantId);

  return {
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    fullName: user.fullName,
    role: user.role as UserRole,
    features,
    mustChangePassword: user.mustChangePassword,
  };
}

async function issueTokenPair(userId: string): Promise<{
  accessToken: string;
  refreshToken: string;
  user: AuthenticatedUser;
}> {
  const user = await buildAuthenticatedUser(userId);
  const accessToken = signAccessToken(user);
  const refreshToken = generateRefreshToken();

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt,
    },
  });

  return { accessToken, refreshToken, user };
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const user = await prisma.user.findFirst({
    where: {
      email: email.toLowerCase(),
      deletedAt: null,
      isActive: true,
    },
  });

  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const valid = await argon2.verify(user.passwordHash, password);
  if (!valid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (user.tenantId) {
    await assertTenantPortalAccess(user.tenantId, { forLogin: true });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const tokens = await issueTokenPair(user.id);

  return {
    ...tokens,
    mustChangePassword: tokens.user.mustChangePassword,
  };
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<LoginResult> {
  if (newPassword.length < 8) {
    throw new ValidationError('New password must be at least 8 characters');
  }

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null, isActive: true },
  });

  if (!user) {
    throw new UnauthorizedError('User not found or inactive');
  }

  const valid = await argon2.verify(user.passwordHash, currentPassword);
  if (!valid) {
    throw new UnauthorizedError('Current password is incorrect');
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(newPassword),
      mustChangePassword: false,
    },
  });

  // Revoke all existing refresh tokens on password change
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  const tokens = await issueTokenPair(userId);
  return { ...tokens, mustChangePassword: false };
}

/** Refresh token rotation: old token revoked, new token issued. */
export async function refreshAccessToken(refreshToken: string): Promise<TokenPair> {
  const tokenHash = hashToken(refreshToken);

  const stored = await prisma.refreshToken.findFirst({
    where: {
      tokenHash,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
  });

  if (!stored) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const authenticated = await buildAuthenticatedUser(stored.userId);
  if (authenticated.tenantId) {
    await assertTenantPortalAccess(authenticated.tenantId, { forLogin: true });
  }
  const accessToken = signAccessToken(authenticated);
  const newRefreshToken = generateRefreshToken();

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    }),
    prisma.refreshToken.create({
      data: {
        userId: stored.userId,
        tokenHash: hashToken(newRefreshToken),
        expiresAt: stored.expiresAt,
      },
    }),
  ]);

  return { accessToken, refreshToken: newRefreshToken };
}

export async function logout(refreshToken: string): Promise<void> {
  const tokenHash = hashToken(refreshToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function verifyAccessToken(token: string): AuthenticatedUser {
  try {
    const payload = jwt.verify(token, appConfig.jwt.secret) as jwt.JwtPayload & {
      sub: string;
      tenantId: string | null;
      role: UserRole;
      features: FeatureKey[];
      mustChangePassword?: boolean;
    };

    return {
      id: payload.sub,
      tenantId: payload.tenantId ?? null,
      email: '',
      fullName: '',
      role: payload.role,
      features: payload.features ?? [],
      mustChangePassword: payload.mustChangePassword ?? false,
    };
  } catch {
    throw new UnauthorizedError('Invalid or expired access token');
  }
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export function isSuperAdmin(role: UserRole): boolean {
  return role === USER_ROLES.SUPER_ADMIN;
}

export function isClientAdmin(role: UserRole): boolean {
  return role === USER_ROLES.CLIENT_ADMIN;
}

export async function registerAuthDecorators(app: FastifyInstance): Promise<void> {
  app.decorateRequest('user', undefined);
}
