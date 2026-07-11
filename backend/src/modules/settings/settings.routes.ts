import type { FastifyInstance } from 'fastify';
import { FEATURES } from '@pos/shared';

import { ValidationError } from '../core/errors.js';
import { resolveTenantId } from '../core/tenant.js';
import { authenticate, requireFeature } from '../permissions/permissions.middleware.js';
import { getSettings, exportTenantData, settingsSchema, updateSettings } from './settings.service.js';
import { testNetworkPrinter } from '../printer/printer.service.js';

export async function registerSettingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/settings', { preHandler: [authenticate, requireFeature(FEATURES.SETTINGS_VIEW)] }, async (request) => {
    return getSettings(resolveTenantId(request));
  });

  app.patch('/settings', { preHandler: [authenticate, requireFeature(FEATURES.SETTINGS_EDIT)] }, async (request) => {
    const parsed = settingsSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid request body', parsed.error.flatten());
    return updateSettings(resolveTenantId(request), parsed.data);
  });

  app.get('/settings/export', { preHandler: [authenticate, requireFeature(FEATURES.SETTINGS_EDIT)] }, async (request) => {
    return exportTenantData(resolveTenantId(request));
  });

  app.post(
    '/settings/printer-test',
    {
      preHandler: [
        authenticate,
        requireFeature(FEATURES.SETTINGS_EDIT),
        requireFeature(FEATURES.BILLING_PRINT_RECEIPT),
      ],
    },
    async (request) => {
      return testNetworkPrinter(resolveTenantId(request));
    },
  );
}
