import { ForbiddenError, NotFoundError } from '../core/errors.js';
import { prisma } from '../core/prisma.js';
import { fetchCloudRecord } from './cloud-client.js';
import { reconcileLocalWithRemote } from './reconcile-remote.service.js';
import { getSyncWorkerConfig, isHybridWorkerConfigured } from './sync-config.js';

export async function getFailedOutboxCount(tenantId: string): Promise<number> {
  return prisma.syncOutbox.count({
    where: { tenantId, status: 'FAILED' },
  });
}

export async function listOutboxIssues(tenantId: string) {
  const rows = await prisma.syncOutbox.findMany({
    where: { tenantId, status: { in: ['CONFLICT', 'FAILED'] } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return rows.map((row) => ({
    id: row.id,
    tableName: row.tableName,
    recordId: row.recordId,
    operation: row.operation,
    status: row.status,
    errorMessage: row.errorMessage,
    retryCount: row.retryCount,
    createdAt: row.createdAt.toISOString(),
    syncedAt: row.syncedAt?.toISOString() ?? null,
  }));
}

/** Re-queue a CONFLICT or FAILED row for the next push cycle. */
export async function retryOutboxEntry(tenantId: string, outboxId: string) {
  const row = await prisma.syncOutbox.findFirst({
    where: { id: outboxId, tenantId, status: { in: ['CONFLICT', 'FAILED'] } },
  });
  if (!row) throw new NotFoundError('Outbox entry not found or not retryable');

  await prisma.syncOutbox.update({
    where: { id: outboxId },
    data: { status: 'PENDING', errorMessage: null, retryCount: 0 },
  });

  return { id: outboxId, status: 'PENDING' as const };
}

/**
 * Accept cloud / remote wins: fetch authoritative cloud row, reconcile local DB,
 * then mark the outbox entry SYNCED.
 */
export async function dismissOutboxEntry(tenantId: string, outboxId: string, reason: string) {
  if (!isHybridWorkerConfigured()) {
    throw new ForbiddenError('Dismiss requires hybrid mode with sync worker configuration');
  }

  const row = await prisma.syncOutbox.findFirst({
    where: { id: outboxId, tenantId, status: { in: ['CONFLICT', 'FAILED'] } },
  });
  if (!row) throw new NotFoundError('Outbox entry not found or not dismissible');

  const config = getSyncWorkerConfig();
  const remote = await fetchCloudRecord(config, tenantId, row.tableName, row.recordId);

  let reconcile: Awaited<ReturnType<typeof reconcileLocalWithRemote>> = 'unchanged';
  await prisma.$transaction(async (tx) => {
    reconcile = await reconcileLocalWithRemote(tx, tenantId, row, remote);
    await tx.syncOutbox.update({
      where: { id: outboxId },
      data: {
        status: 'SYNCED',
        syncedAt: new Date(),
        retryCount: 0,
        errorMessage: `dismissed (${reconcile}): ${reason}`,
      },
    });
  });

  return { id: outboxId, status: 'SYNCED' as const, reconcile };
}

export function buildSyncStatusMessage(
  pending: number,
  conflicts: number,
  failed: number,
): string | null {
  if (conflicts > 0) {
    return `${conflicts} change(s) could not sync and need review. Use GET /sync/outbox/issues or retry/dismiss endpoints.`;
  }
  if (failed > 0) {
    return `${failed} change(s) failed to sync; they will retry up to the configured limit, then require review.`;
  }
  if (pending > 0) {
    return `${pending} change(s) waiting to sync.`;
  }
  return null;
}
