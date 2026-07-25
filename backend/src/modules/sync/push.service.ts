import { prisma } from '../core/prisma.js';
import { postCloudIngest } from './cloud-client.js';
import { nextFailedPushState } from './reconcile-remote.service.js';
import type { SyncWorkerConfig } from './sync-config.js';

export interface PushSummary {
  pushed: number;
  skipped: number;
  conflicts: number;
  failed: number;
}

export async function pushPendingOutbox(config: SyncWorkerConfig): Promise<PushSummary> {
  const summary: PushSummary = { pushed: 0, skipped: 0, conflicts: 0, failed: 0 };

  const pending = await prisma.syncOutbox.findMany({
    where: { tenantId: config.tenantId!, status: { in: ['PENDING', 'FAILED'] } },
    orderBy: { createdAt: 'asc' },
    take: config.batchSize,
  });

  if (pending.length === 0) return summary;

  const response = await postCloudIngest(config, {
    tenantId: config.tenantId!,
    deviceId: config.deviceId,
    entries: pending.map((row) => ({
      outboxId: row.id,
      tableName: row.tableName,
      recordId: row.recordId,
      operation: row.operation,
      payload: row.payload as Record<string, unknown>,
      recordVersion: row.recordVersion,
      createdAt: row.createdAt.toISOString(),
    })),
  });

  const resultMap = new Map(response.results.map((r) => [r.outboxId, r]));

  await prisma.$transaction(async (tx) => {
    for (const row of pending) {
      const result = resultMap.get(row.id);
      if (!result) continue;

      if (result.status === 'accepted') {
        await tx.syncOutbox.update({
          where: { id: row.id },
          data: { status: 'SYNCED', syncedAt: new Date(), errorMessage: null, retryCount: 0 },
        });
        summary.pushed += 1;
      } else if (result.status === 'skipped') {
        await tx.syncOutbox.update({
          where: { id: row.id },
          data: {
            status: 'SYNCED',
            syncedAt: new Date(),
            errorMessage: result.reason ?? 'skipped on cloud',
            retryCount: 0,
          },
        });
        summary.skipped += 1;
      } else if (result.status === 'conflict') {
        await tx.syncOutbox.update({
          where: { id: row.id },
          data: { status: 'CONFLICT', errorMessage: result.reason ?? 'conflict' },
        });
        summary.conflicts += 1;
      } else {
        const next = nextFailedPushState(
          row.retryCount,
          config.maxFailedRetries,
          result.reason ?? 'failed',
        );
        await tx.syncOutbox.update({
          where: { id: row.id },
          data: {
            status: next.status,
            retryCount: next.retryCount,
            errorMessage: next.errorMessage,
          },
        });
        if (next.status === 'CONFLICT') summary.conflicts += 1;
        else summary.failed += 1;
      }
    }

    await tx.syncState.upsert({
      where: { tenantId: config.tenantId! },
      create: { tenantId: config.tenantId!, lastPushedAt: new Date() },
      update: { lastPushedAt: new Date() },
    });
  });

  return summary;
}
