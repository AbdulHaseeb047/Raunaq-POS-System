import type { Prisma } from '@prisma/client';
import { SyncOperation } from '@prisma/client';

import type { TransactionClient } from '../core/prisma.js';
import { prisma } from '../core/prisma.js';

/** Tables whose UPDATE payloads must omit denormalized balance fields. */
const BALANCE_EXCLUDED_COLUMNS = new Set(['balance']);

export interface OutboxEntryInput {
  tenantId: string;
  tableName: string;
  recordId: string;
  operation: SyncOperation;
  payload: Prisma.InputJsonValue;
  recordVersion: number;
}

function sanitizePayload(tableName: string, payload: Prisma.InputJsonValue): Prisma.InputJsonValue {
  if (
    tableName !== 'customers' ||
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload)
  ) {
    return payload;
  }

  const copy = { ...(payload as Record<string, unknown>) };
  for (const column of BALANCE_EXCLUDED_COLUMNS) {
    delete copy[column];
  }
  return copy as Prisma.InputJsonValue;
}

/** Outbox is for hybrid installs pushing local writes to cloud — not cloud or offline targets. */
export function isSyncOutboxActive(): boolean {
  return process.env.DEPLOYMENT_MODE === 'hybrid';
}

/**
 * Enqueues a change for cloud sync. No-op unless `DEPLOYMENT_MODE=hybrid`.
 * Call inside the same transaction as the business write when possible.
 */
export async function enqueueSyncOutbox(
  tx: TransactionClient,
  entry: OutboxEntryInput,
): Promise<void> {
  if (!isSyncOutboxActive()) return;

  await tx.syncOutbox.create({
    data: {
      tenantId: entry.tenantId,
      tableName: entry.tableName,
      recordId: entry.recordId,
      operation: entry.operation,
      payload: sanitizePayload(entry.tableName, entry.payload),
      recordVersion: entry.recordVersion,
    },
  });
}

export async function getPendingOutboxCount(tenantId: string): Promise<number> {
  return prisma.syncOutbox.count({
    where: { tenantId, status: 'PENDING' },
  });
}

export async function getConflictOutboxCount(tenantId: string): Promise<number> {
  return prisma.syncOutbox.count({
    where: { tenantId, status: 'CONFLICT' },
  });
}
