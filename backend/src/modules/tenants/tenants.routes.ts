import type { FastifyInstance } from 'fastify';
import type { FeatureKey } from '@pos/shared';

import {
  authenticate,
  requirePlatformAdmin,
  requirePlatformOwner,
  requireTenantAccess,
} from '../permissions/permissions.middleware.js';
import {
  createTenant,
  createTenantSchema,
  getTenantById,
  listTenants,
  restoreTenantPortalAccess,
  restoreTenantAccessSchema,
  revokeTenantPortalAccess,
  revokeTenantAccessSchema,
  setTenantFeaturesSchema,
  updateTenant,
  updateTenantFeatures,
  updateTenantSchema,
} from './tenants.service.js';
import { ValidationError } from '../core/errors.js';

export async function registerTenantRoutes(app: FastifyInstance): Promise<void> {
  const platformRead = {
    preHandler: [authenticate, requirePlatformAdmin()],
    config: { rateLimit: { max: 60, timeWindow: '1 minute' as const } },
  };
  const platformWrite = {
    preHandler: [authenticate, requirePlatformOwner()],
    config: { rateLimit: { max: 15, timeWindow: '1 minute' as const } },
  };

  app.get('/tenants', platformRead, async (request) => {
    const q = request.query as { page?: string; pageSize?: string };
    const page = q.page ? Number(q.page) : 1;
    const pageSize = q.pageSize ? Number(q.pageSize) : 20;
    return listTenants(page, pageSize);
  });

  app.get('/tenants/:tenantId', { preHandler: [authenticate] }, async (request) => {
    const { tenantId } = request.params as { tenantId: string };
    requireTenantAccess(request, tenantId);
    return getTenantById(tenantId);
  });

  app.post('/tenants', platformWrite, async (request) => {
    const parsed = createTenantSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request body', parsed.error.flatten());
    }
    return createTenant(parsed.data, request.user!.id);
  });

  app.patch('/tenants/:tenantId', platformWrite, async (request) => {
    const { tenantId } = request.params as { tenantId: string };
    const parsed = updateTenantSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request body', parsed.error.flatten());
    }
    return updateTenant(tenantId, parsed.data, request.user!.id);
  });

  app.put('/tenants/:tenantId/features', platformWrite, async (request) => {
    const { tenantId } = request.params as { tenantId: string };
    const parsed = setTenantFeaturesSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request body', parsed.error.flatten());
    }
    return updateTenantFeatures(
      tenantId,
      parsed.data.featureKeys as FeatureKey[],
      request.user!.id,
      request.ip,
    );
  });

  app.post('/tenants/:tenantId/revoke-access', platformWrite, async (request) => {
    const { tenantId } = request.params as { tenantId: string };
    const parsed = revokeTenantAccessSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw new ValidationError('Invalid request body', parsed.error.flatten());
    }
    const reason = parsed.data.reason ?? 'Access revoked by platform administrator';
    return revokeTenantPortalAccess(tenantId, reason, request.user!.id, request.ip);
  });

  app.post('/tenants/:tenantId/restore-access', platformWrite, async (request) => {
    const { tenantId } = request.params as { tenantId: string };
    const parsed = restoreTenantAccessSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw new ValidationError('Invalid request body', parsed.error.flatten());
    }
    return restoreTenantPortalAccess(tenantId, parsed.data, request.user!.id, request.ip);
  });
}
