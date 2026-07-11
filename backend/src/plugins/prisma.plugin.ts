import type { FastifyInstance } from 'fastify';

import { prisma } from '../modules/core/prisma.js';

export async function registerPrisma(app: FastifyInstance): Promise<void> {
  app.decorate('prisma', prisma);

  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
}

declare module 'fastify' {
  interface FastifyInstance {
    prisma: typeof prisma;
  }
}
