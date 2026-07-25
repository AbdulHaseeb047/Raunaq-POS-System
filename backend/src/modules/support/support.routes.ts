import type { FastifyInstance } from 'fastify';

import { ValidationError } from '../core/errors.js';
import { resolveTenantId } from '../core/tenant.js';
import { authenticate } from '../permissions/permissions.middleware.js';
import { createSupportQuery, createSupportQuerySchema } from './support.service.js';

export async function registerSupportRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/support/queries',
    {
      preHandler: [authenticate],
      config: {
        rateLimit: { max: 10, timeWindow: '15 minutes' as const },
      },
    },
    async (request) => {
      const parsed = createSupportQuerySchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid request body', parsed.error.flatten());
      }

      const tenantId = resolveTenantId(request);
      const userId = request.user!.id;
      return createSupportQuery(tenantId, userId, parsed.data);
    },
  );
}
