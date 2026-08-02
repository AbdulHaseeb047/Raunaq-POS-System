import type { FeatureKey, UserRole } from '@pos/shared';
import { USER_ROLES } from '@pos/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { readAccessToken } from '../auth/auth-cookies.js';
import { verifyAccessToken } from '../auth/auth.service.js';
import { ForbiddenError, UnauthorizedError } from '../core/errors.js';
import { prisma } from '../core/prisma.js';
import { applyRlsSession } from '../core/rls.js';
import { enterTenantContext } from '../core/tenant-context.js';
import { assertTenantPortalAccess } from '../tenants/subscription.service.js';
import {
  getCachedPortalAccess,
  getCachedUserFeatures,
  setCachedPortalAccessError,
  setCachedPortalAccessOk,
  setCachedUserFeatures,
} from './access-cache.js';
import { userHasFeature } from './permissions.service.js';

const PASSWORD_CHANGE_ALLOWED_PATHS = new Set([
  '/auth/change-password',
  '/auth/logout',
  '/auth/refresh',
]);

async function assertTenantPortalAccessCached(tenantId: string): Promise<void> {
  const cached = getCachedPortalAccess(tenantId);
  if (cached) {
    if (!cached.ok) throw cached.error;
    return;
  }
  try {
    await assertTenantPortalAccess(tenantId);
    setCachedPortalAccessOk(tenantId);
  } catch (error) {
    setCachedPortalAccessError(tenantId, error);
    throw error;
  }
}

export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const token = readAccessToken(request);
  if (!token) {
    throw new UnauthorizedError('Missing or invalid session');
  }

  request.user = verifyAccessToken(token);

  const bypass = request.user.role === USER_ROLES.SUPER_ADMIN;
  const tenantCtx = { tenantId: request.user.tenantId, bypass };
  enterTenantContext(tenantCtx);
  await applyRlsSession(tenantCtx);

  if (request.user.tenantId) {
    // Parallelize the two DB checks that used to run sequentially on every request.
    const [, dbUser] = await Promise.all([
      assertTenantPortalAccessCached(request.user.tenantId),
      prisma.user.findFirst({
        where: { id: request.user.id, deletedAt: null },
        select: { isActive: true },
      }),
    ]);
    if (!dbUser?.isActive) {
      throw new UnauthorizedError(
        'Your account has been deactivated. Contact your shop administrator.',
        'USER_DEACTIVATED',
      );
    }
  }

  if (
    request.user.mustChangePassword &&
    !PASSWORD_CHANGE_ALLOWED_PATHS.has(request.routeOptions?.url ?? request.url.split('?')[0] ?? '')
  ) {
    throw new ForbiddenError(
      'Password change required before accessing this resource',
      'PASSWORD_CHANGE_REQUIRED',
    );
  }
}

export function requirePlatformAdmin() {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      throw new UnauthorizedError();
    }
    if (request.user.role !== USER_ROLES.SUPER_ADMIN || request.user.tenantId !== null) {
      throw new ForbiddenError('Platform administrator access required');
    }
  };
}

/** Stricter guard for routes that mutate platform data (not sales-rep accounts). */
export function requirePlatformOwner() {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      throw new UnauthorizedError();
    }
    if (request.user.role !== USER_ROLES.SUPER_ADMIN || request.user.tenantId !== null) {
      throw new ForbiddenError('Platform administrator access required');
    }

    const dbUser = await prisma.user.findFirst({
      where: { id: request.user.id, deletedAt: null, isActive: true },
      select: { isSalesRep: true },
    });

    if (!dbUser || dbUser.isSalesRep) {
      throw new ForbiddenError('This action requires a platform owner account');
    }
  };
}

export function requireRole(...roles: UserRole[]) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      throw new UnauthorizedError();
    }
    if (!roles.includes(request.user.role)) {
      throw new ForbiddenError('Insufficient role');
    }
  };
}

export function requireFeature(...features: FeatureKey[]) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      throw new UnauthorizedError();
    }

    if (request.user.role === USER_ROLES.SUPER_ADMIN) {
      return;
    }

    // Soft-lock can change mid-session; cache briefly so parallel page APIs don't each re-hit DB.
    const { resolveUserFeatures } = await import('./permissions.service.js');
    const cacheKey = `${request.user.tenantId ?? 'none'}:${request.user.id}:${request.user.role}`;
    let liveFeatures = getCachedUserFeatures(cacheKey);
    if (!liveFeatures) {
      liveFeatures = await resolveUserFeatures(
        request.user.id,
        request.user.role,
        request.user.tenantId,
      );
      setCachedUserFeatures(cacheKey, liveFeatures);
    }
    request.user.features = liveFeatures;

    const allowed = features.some((f) => userHasFeature(liveFeatures, f));
    if (!allowed) {
      throw new ForbiddenError(
        'This feature requires a plan upgrade. Contact Raunaq to unlock it.',
        'UPGRADE_REQUIRED',
      );
    }
  };
}

/** @deprecated Use resolveTenantId from core/tenant.ts — Client Admin must not trust URL params. */
export function requireTenantAccess(request: FastifyRequest, tenantId: string): void {
  if (!request.user) {
    throw new UnauthorizedError();
  }

  if (request.user.role === USER_ROLES.SUPER_ADMIN) {
    return;
  }

  if (request.user.tenantId !== tenantId) {
    throw new ForbiddenError('Access denied to this tenant');
  }
}
