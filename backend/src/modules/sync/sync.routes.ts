import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { USER_ROLES } from '@pos/shared';

import { appConfig } from '../../config.js';
import { ForbiddenError, ValidationError } from '../core/errors.js';
import { prisma } from '../core/prisma.js';
import { resolveTenantId } from '../core/tenant.js';
import { authenticate } from '../permissions/permissions.middleware.js';
import { fetchChangelogSince } from './changelog.service.js';
import { getCloudRecord } from './cloud-record.service.js';
import { ingestRemoteChanges, ingestRequestSchema } from './ingest.service.js';
import {
  buildSyncStatusMessage,
  dismissOutboxEntry,
  getFailedOutboxCount,
  listOutboxIssues,
  retryOutboxEntry,
} from './outbox-issues.service.js';
import { getConflictOutboxCount, getPendingOutboxCount, isSyncOutboxActive } from './outbox.service.js';
import { requireSyncApiKey } from './sync-auth.middleware.js';
import { registerSyncDevice, assertSyncDeviceBinding } from './sync-device.service.js';
import { getSyncWorkerConfig, isCloudIngestEnabled, isHybridWorkerConfigured } from './sync-config.js';
import { isSyncWorkerRunning, runSyncCycle } from './worker.js';

const registerDeviceSchema = z.object({
  deviceId: z.string().min(1).max(100),
  label: z.string().max(255).optional(),
});

const dismissSchema = z.object({
  reason: z.string().min(1).max(500),
});

export async function registerSyncRoutes(app: FastifyInstance): Promise<void> {
  app.get('/sync/status', { preHandler: [authenticate] }, async (request) => {
    const tenantId = resolveTenantId(request);
    const pendingCount = isSyncOutboxActive() ? await getPendingOutboxCount(tenantId) : 0;
    const conflictCount = isSyncOutboxActive() ? await getConflictOutboxCount(tenantId) : 0;
    const failedCount = isSyncOutboxActive() ? await getFailedOutboxCount(tenantId) : 0;

    const syncState = await prisma.syncState.findUnique({ where: { tenantId } });
    const config = getSyncWorkerConfig();

    let status: 'synced' | 'pending' | 'conflict' | 'failed' = 'synced';
    if (conflictCount > 0) status = 'conflict';
    else if (failedCount > 0) status = 'failed';
    else if (pendingCount > 0) status = 'pending';

    return {
      deploymentMode: appConfig.deploymentMode,
      pendingChanges: pendingCount,
      conflictChanges: conflictCount,
      failedChanges: failedCount,
      status,
      userMessage: buildSyncStatusMessage(pendingCount, conflictCount, failedCount),
      workerRunning: isSyncWorkerRunning(),
      workerConfigured: isHybridWorkerConfigured(config),
      lastPushedAt: syncState?.lastPushedAt?.toISOString() ?? null,
      lastPulledAt: syncState?.lastPulledAt?.toISOString() ?? null,
      cloudCursor: syncState?.cloudCursor ?? null,
    };
  });

  app.get('/sync/outbox/issues', { preHandler: [authenticate] }, async (request) => {
    if (!isSyncOutboxActive()) {
      return { data: [] };
    }
    const tenantId = resolveTenantId(request);
    return { data: await listOutboxIssues(tenantId) };
  });

  app.post('/sync/outbox/:outboxId/retry', { preHandler: [authenticate] }, async (request) => {
    if (!isSyncOutboxActive()) {
      throw new ForbiddenError('Outbox retry is only available in hybrid mode');
    }
    if (request.user!.role === USER_ROLES.STAFF) {
      throw new ForbiddenError('Only client admins can manage sync conflicts');
    }
    const { outboxId } = request.params as { outboxId: string };
    return retryOutboxEntry(resolveTenantId(request), outboxId);
  });

  app.post('/sync/outbox/:outboxId/dismiss', { preHandler: [authenticate] }, async (request) => {
    if (!isSyncOutboxActive()) {
      throw new ForbiddenError('Outbox dismiss is only available in hybrid mode');
    }
    if (request.user!.role === USER_ROLES.STAFF) {
      throw new ForbiddenError('Only client admins can manage sync conflicts');
    }
    const { outboxId } = request.params as { outboxId: string };
    const parsed = dismissSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid request body', parsed.error.flatten());
    return dismissOutboxEntry(resolveTenantId(request), outboxId, parsed.data.reason);
  });

  app.post('/sync/run', { preHandler: [authenticate] }, async (request) => {
    if (!isHybridWorkerConfigured()) {
      throw new ForbiddenError(
        'Manual sync requires hybrid mode with SYNC_CLOUD_URL, SYNC_API_KEY, SYNC_DEVICE_ID, and TENANT_ID',
      );
    }
    const summary = await runSyncCycle(getSyncWorkerConfig(), request.log);
    return summary ?? { online: false, push: null, pull: null };
  });

  app.post('/sync/devices', { preHandler: [authenticate] }, async (request) => {
    if (request.user!.role === USER_ROLES.STAFF) {
      throw new ForbiddenError('Only client admins can register sync devices');
    }
    const parsed = registerDeviceSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid request body', parsed.error.flatten());
    return registerSyncDevice(resolveTenantId(request), parsed.data.deviceId, parsed.data.label);
  });

  if (isCloudIngestEnabled()) {
    app.post('/sync/ingest', { preHandler: [requireSyncApiKey] }, async (request) => {
      const parsed = ingestRequestSchema.safeParse(request.body);
      if (!parsed.success) throw new ValidationError('Invalid ingest payload', parsed.error.flatten());

      const results = await ingestRemoteChanges(parsed.data, request.syncDevice!);
      return { results };
    });

    app.get('/sync/changes', { preHandler: [requireSyncApiKey] }, async (request) => {
      const q = request.query as { tenantId?: string; cursor?: string; limit?: string };
      if (!q.tenantId) throw new ValidationError('tenantId is required');

      assertSyncDeviceBinding(request.syncDevice!, q.tenantId, request.syncDevice!.deviceId);

      const limit = q.limit ? Math.min(Number(q.limit), 100) : 50;
      const changes = await fetchChangelogSince(
        q.tenantId,
        q.cursor ?? null,
        limit,
        request.syncDevice!.deviceId,
      );

      return {
        changes: changes.map((c) => ({
          id: c.id,
          tableName: c.tableName,
          recordId: c.recordId,
          operation: c.operation,
          payload: c.payload,
          recordVersion: c.recordVersion,
          createdAt: c.createdAt.toISOString(),
        })),
        nextCursor: changes.length > 0 ? changes[changes.length - 1]!.id : q.cursor ?? null,
      };
    });

    app.get(
      '/sync/records/:tableName/:recordId',
      { preHandler: [requireSyncApiKey] },
      async (request, reply) => {
        const { tableName, recordId } = request.params as { tableName: string; recordId: string };
        const q = request.query as { tenantId?: string };
        if (!q.tenantId) throw new ValidationError('tenantId is required');

        assertSyncDeviceBinding(request.syncDevice!, q.tenantId, request.syncDevice!.deviceId);

        const record = await getCloudRecord(q.tenantId, tableName, recordId);
        if (!record) return reply.status(404).send({ message: 'Remote record not found' });

        return record;
      },
    );
  }
}
