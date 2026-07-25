import 'dotenv/config';

import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';

import { appConfig } from './config.js';
import { registerAuthRoutes } from './modules/auth/auth.routes.js';
import { registerBillingRoutes } from './modules/billing/billing.routes.js';
import { registerCatalogRoutes } from './modules/catalog/catalog.routes.js';
import { registerCustomerRoutes } from './modules/customers/customers.routes.js';
import { registerBranchRoutes } from './modules/branches/branches.routes.js';
import { registerReportRoutes } from './modules/reports/reports.routes.js';
import { registerSettingsRoutes } from './modules/settings/settings.routes.js';
import { registerInventoryRoutes } from './modules/inventory/inventory.routes.js';
import { registerPermissionRoutes } from './modules/permissions/permissions.routes.js';
import { registerSyncRoutes } from './modules/sync/sync.routes.js';
import { startSyncWorker, stopSyncWorker } from './modules/sync/worker.js';
import { registerAdminRoutes } from './modules/admin/admin.routes.js';
import { registerTenantRoutes } from './modules/tenants/tenants.routes.js';
import { registerUserRoutes } from './modules/users/users.routes.js';
import { registerErrorHandler } from './plugins/error-handler.plugin.js';
import { registerPrisma } from './plugins/prisma.plugin.js';
import { prisma } from './modules/core/prisma.js';
import { clearRlsSession } from './modules/core/rls.js';
import { startSubscriptionInterval } from './modules/tenants/subscription.service.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: appConfig.nodeEnv === 'production' ? 'info' : 'debug',
    },
  });

  registerErrorHandler(app);

  if (appConfig.trustProxy) {
    app.log.info('Trust proxy enabled');
  }

  await app.register(helmet, {
    contentSecurityPolicy: appConfig.nodeEnv === 'production',
  });
  await app.register(cors, {
    origin: appConfig.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  // Search + POS fire many requests; 100/min was too low for hosted use.
  await app.register(rateLimit, {
    max: appConfig.nodeEnv === 'production' ? 600 : 1200,
    timeWindow: '1 minute',
  });

  await registerPrisma(app);

  app.addHook('onResponse', async () => {
    await clearRlsSession();
  });

  app.get('/health', async () => {
    let database: 'connected' | 'disconnected' = 'disconnected';
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = 'connected';
    } catch {
      database = 'disconnected';
    }

    return {
      status: database === 'connected' ? ('ok' as const) : ('degraded' as const),
      timestamp: new Date().toISOString(),
      database,
      deploymentMode: appConfig.deploymentMode,
    };
  });

  await registerAuthRoutes(app);
  await registerPermissionRoutes(app);
  await registerTenantRoutes(app);
  await registerAdminRoutes(app);
  await registerUserRoutes(app);
  await registerInventoryRoutes(app);
  await registerCatalogRoutes(app);
  await registerBillingRoutes(app);
  await registerCustomerRoutes(app);
  await registerSettingsRoutes(app);
  await registerBranchRoutes(app);
  await registerReportRoutes(app);
  await registerSyncRoutes(app);

  return app;
}

async function start() {
  const app = await buildApp();
  let subscriptionTimer: NodeJS.Timeout | undefined;

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Shutting down');
    stopSyncWorker();
    if (subscriptionTimer) clearInterval(subscriptionTimer);
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ port: appConfig.port, host: appConfig.host });
    app.log.info(`Server listening on ${appConfig.host}:${appConfig.port}`);

    subscriptionTimer = startSubscriptionInterval(app.log);

    if (appConfig.deploymentMode === 'hybrid') {
      startSyncWorker(app.log);
    }
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

const isDirectRun = process.argv[1]?.includes('index');
if (isDirectRun) {
  start();
}
