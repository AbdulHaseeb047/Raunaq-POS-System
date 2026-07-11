import { SYNC_TABLES } from './sync-payload.js';
import { prisma } from '../core/prisma.js';
import { applySyncChange } from './apply-change.js';
import { getCloudChanges } from './cloud-client.js';
import { recomputeCustomerBalance } from './reconcile-balance.js';
import type { SyncWorkerConfig } from './sync-config.js';

const LEDGER_TABLES = new Set<string>([
  SYNC_TABLES.customerLedgerEntries,
  SYNC_TABLES.customerPaymentAllocations,
  SYNC_TABLES.customerCreditObligations,
]);

export interface PullSummary {
  applied: number;
  skipped: number;
  conflicts: number;
}

export async function pullRemoteChanges(config: SyncWorkerConfig): Promise<PullSummary> {
  const summary: PullSummary = { applied: 0, skipped: 0, conflicts: 0 };
  const state = await prisma.syncState.upsert({
    where: { tenantId: config.tenantId! },
    create: { tenantId: config.tenantId! },
    update: {},
  });

  const response = await getCloudChanges(config, {
    tenantId: config.tenantId!,
    cursor: state.cloudCursor,
    limit: config.batchSize,
    deviceId: config.deviceId,
  });

  if (response.changes.length === 0) {
    return summary;
  }

  const touchedCustomers = new Set<string>();

  await prisma.$transaction(async (tx) => {
    for (const change of response.changes) {
      const outcome = await applySyncChange(tx, {
        tableName: change.tableName,
        recordId: change.recordId,
        operation: change.operation,
        payload: change.payload,
        recordVersion: change.recordVersion,
      });

      if (outcome.result === 'applied') {
        summary.applied += 1;
        if (LEDGER_TABLES.has(change.tableName) && typeof change.payload.customer_id === 'string') {
          touchedCustomers.add(change.payload.customer_id);
        }
      } else if (outcome.result === 'conflict') {
        summary.conflicts += 1;
      } else {
        summary.skipped += 1;
      }
    }

    for (const customerId of touchedCustomers) {
      await recomputeCustomerBalance(tx, config.tenantId!, customerId);
    }

    await tx.syncState.update({
      where: { tenantId: config.tenantId! },
      data: {
        cloudCursor: response.nextCursor,
        lastPulledAt: new Date(),
      },
    });
  });

  return summary;
}
