import type { FastifyInstance } from 'fastify';

import { prisma } from '../core/prisma.js';
import { authenticate } from './permissions.middleware.js';

export async function registerPermissionRoutes(app: FastifyInstance): Promise<void> {
  app.get('/features', { preHandler: [authenticate] }, async () => {
    const features = await prisma.featureRegistry.findMany({
      where: { isActive: true },
      orderBy: [{ module: 'asc' }, { key: 'asc' }],
    });

    return features.map((f) => ({
      key: f.key,
      module: f.module,
      label: f.label,
      description: f.description,
    }));
  });
}
