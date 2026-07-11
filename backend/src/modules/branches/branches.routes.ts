import type { FastifyInstance } from 'fastify';
import { FEATURES } from '@pos/shared';

import { ValidationError } from '../core/errors.js';
import { resolveTenantId } from '../core/tenant.js';
import { authenticate, requireFeature } from '../permissions/permissions.middleware.js';
import { branchSchema, createBranch, listBranches, updateBranch } from './branches.service.js';

export async function registerBranchRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/branches',
    { preHandler: [authenticate, requireFeature(FEATURES.MULTI_BRANCH_ACCESS)] },
    async (request) => listBranches(resolveTenantId(request)),
  );

  app.post(
    '/branches',
    { preHandler: [authenticate, requireFeature(FEATURES.MULTI_BRANCH_ACCESS)] },
    async (request) => {
      const parsed = branchSchema.safeParse(request.body);
      if (!parsed.success) throw new ValidationError('Invalid request body', parsed.error.flatten());
      return createBranch(resolveTenantId(request), parsed.data);
    },
  );

  app.patch(
    '/branches/:branchId',
    { preHandler: [authenticate, requireFeature(FEATURES.MULTI_BRANCH_ACCESS)] },
    async (request) => {
      const { branchId } = request.params as { branchId: string };
      const parsed = branchSchema.partial().safeParse(request.body);
      if (!parsed.success) throw new ValidationError('Invalid request body', parsed.error.flatten());
      return updateBranch(resolveTenantId(request), branchId, parsed.data);
    },
  );
}
