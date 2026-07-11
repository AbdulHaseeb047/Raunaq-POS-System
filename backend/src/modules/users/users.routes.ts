import type { FastifyInstance } from 'fastify';
import { FEATURES, USER_ROLES } from '@pos/shared';
import type { FeatureKey } from '@pos/shared';

import { ValidationError } from '../core/errors.js';
import { resolveTenantId } from '../core/tenant.js';
import {
  authenticate,
  requireFeature,
  requirePlatformAdmin,
  requirePlatformOwner,
  requireRole,
} from '../permissions/permissions.middleware.js';
import {
  createTenantUser,
  createUserSchema,
  deleteTenantUser,
  listTenantUsers,
  setStaffFeaturesSchema,
  updateTenantUser,
  updateUserFeatures,
  updateUserSchema,
} from './users.service.js';

function clientIp(request: { ip: string }): string {
  return request.ip;
}

/** Client Admin routes — tenant always from JWT, never from URL. */
function registerClientAdminUserRoutes(app: FastifyInstance): void {
  const manageGuard = {
    preHandler: [
      authenticate,
      requireRole(USER_ROLES.CLIENT_ADMIN),
      requireFeature(FEATURES.USERS_MANAGE),
    ],
  };

  app.get('/users', manageGuard, async (request) => {
    const tenantId = resolveTenantId(request);
    const q = request.query as { page?: string; pageSize?: string };
    const page = q.page ? Number(q.page) : 1;
    const pageSize = q.pageSize ? Number(q.pageSize) : 20;
    return listTenantUsers(tenantId, page, pageSize);
  });

  app.post('/users', manageGuard, async (request) => {
    const tenantId = resolveTenantId(request);
    const parsed = createUserSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request body', parsed.error.flatten());
    }

    return createTenantUser(
      tenantId,
      { ...parsed.data, role: USER_ROLES.STAFF },
      request.user!.id,
      request.user!.role,
    );
  });

  app.patch('/users/:userId', manageGuard, async (request) => {
    const tenantId = resolveTenantId(request);
    const { userId } = request.params as { userId: string };
    const parsed = updateUserSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request body', parsed.error.flatten());
    }
    return updateTenantUser(tenantId, userId, parsed.data);
  });

  app.put('/users/:userId/features', manageGuard, async (request) => {
    const tenantId = resolveTenantId(request);
    const { userId } = request.params as { userId: string };
    const parsed = setStaffFeaturesSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request body', parsed.error.flatten());
    }
    return updateUserFeatures(
      tenantId,
      userId,
      parsed.data.featureKeys as FeatureKey[],
      request.user!.id,
      clientIp(request),
    );
  });
}

/** Super Admin routes — explicit tenant in URL. */
function registerSuperAdminUserRoutes(app: FastifyInstance): void {
  const readGuard = {
    preHandler: [authenticate, requirePlatformAdmin()],
    config: { rateLimit: { max: 60, timeWindow: '1 minute' as const } },
  };
  const writeGuard = {
    preHandler: [authenticate, requirePlatformOwner()],
    config: { rateLimit: { max: 20, timeWindow: '1 minute' as const } },
  };

  app.get('/tenants/:tenantId/users', readGuard, async (request) => {
    const tenantId = resolveTenantId(request, (request.params as { tenantId: string }).tenantId);
    const q = request.query as { page?: string; pageSize?: string };
    const page = q.page ? Number(q.page) : 1;
    const pageSize = q.pageSize ? Number(q.pageSize) : 20;
    return listTenantUsers(tenantId, page, pageSize);
  });

  app.post('/tenants/:tenantId/users', writeGuard, async (request) => {
    const tenantId = resolveTenantId(request, (request.params as { tenantId: string }).tenantId);
    const parsed = createUserSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request body', parsed.error.flatten());
    }

    return createTenantUser(tenantId, parsed.data, request.user!.id, USER_ROLES.SUPER_ADMIN);
  });

  app.patch('/tenants/:tenantId/users/:userId', writeGuard, async (request) => {
    const { tenantId, userId } = request.params as { tenantId: string; userId: string };
    resolveTenantId(request, tenantId);
    const parsed = updateUserSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request body', parsed.error.flatten());
    }
    return updateTenantUser(tenantId, userId, parsed.data);
  });

  app.put('/tenants/:tenantId/users/:userId/features', writeGuard, async (request) => {
    const { tenantId, userId } = request.params as { tenantId: string; userId: string };
    resolveTenantId(request, tenantId);
    const parsed = setStaffFeaturesSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request body', parsed.error.flatten());
    }
    return updateUserFeatures(
      tenantId,
      userId,
      parsed.data.featureKeys as FeatureKey[],
      request.user!.id,
      clientIp(request),
    );
  });

  app.delete('/tenants/:tenantId/users/:userId', writeGuard, async (request) => {
    const { tenantId, userId } = request.params as { tenantId: string; userId: string };
    resolveTenantId(request, tenantId);
    await deleteTenantUser(tenantId, userId, request.user!.id, clientIp(request));
    return { success: true };
  });
}

export async function registerUserRoutes(app: FastifyInstance): Promise<void> {
  registerClientAdminUserRoutes(app);
  registerSuperAdminUserRoutes(app);
}
