import type { FastifyInstance } from 'fastify';

import { ValidationError } from '../core/errors.js';
import { authenticate, requirePlatformAdmin, requirePlatformOwner } from '../permissions/permissions.middleware.js';
import {
  createSalesRep,
  createSalesRepSchema,
  getAdminDashboard,
  listSalesReps,
} from './admin.service.js';

const adminReadLimit = {
  rateLimit: { max: 60, timeWindow: '1 minute' as const },
};

const adminWriteLimit = {
  rateLimit: { max: 20, timeWindow: '1 minute' as const },
};

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  const readGuard = { preHandler: [authenticate, requirePlatformAdmin()], config: adminReadLimit };
  const writeGuard = { preHandler: [authenticate, requirePlatformOwner()], config: adminWriteLimit };

  app.get('/admin/dashboard', readGuard, async () => getAdminDashboard());

  app.get('/admin/sales-reps', readGuard, async () => listSalesReps());

  app.post('/admin/sales-reps', writeGuard, async (request) => {
    const parsed = createSalesRepSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid request body', parsed.error.flatten());
    return createSalesRep(parsed.data);
  });
}
