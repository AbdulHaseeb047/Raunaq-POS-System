import type { Prisma, SyncOperation } from '@prisma/client';

import type { TransactionClient } from '../core/prisma.js';
import { prisma } from '../core/prisma.js';

export interface ChangelogEntryInput {
  tenantId: string;
  tableName: string;
  recordId: string;
  operation: SyncOperation;
  payload: Prisma.InputJsonValue;
  recordVersion: number;
  sourceDeviceId?: string | null;
  sourceOutboxId?: string | null;
}

export async function appendChangelog(
  tx: TransactionClient,
  entry: ChangelogEntryInput,
): Promise<string> {
  const row = await tx.syncChangelog.create({
    data: {
      tenantId: entry.tenantId,
      tableName: entry.tableName,
      recordId: entry.recordId,
      operation: entry.operation,
      payload: entry.payload,
      recordVersion: entry.recordVersion,
      sourceDeviceId: entry.sourceDeviceId ?? null,
      sourceOutboxId: entry.sourceOutboxId ?? null,
    },
  });
  return row.id;
}

export interface ChangelogRow {
  id: string;
  tenantId: string;
  tableName: string;
  recordId: string;
  operation: SyncOperation;
  payload: Record<string, unknown>;
  recordVersion: number;
  sourceDeviceId: string | null;
  createdAt: Date;
}

export async function fetchChangelogSince(
  tenantId: string,
  cursor: string | null,
  limit: number,
  excludeDeviceId?: string | null,
): Promise<ChangelogRow[]> {
  const cursorRow = cursor
    ? await prisma.syncChangelog.findFirst({ where: { id: cursor, tenantId } })
    : null;

  const rows = await prisma.syncChangelog.findMany({
    where: {
      tenantId,
      ...(excludeDeviceId ? { sourceDeviceId: { not: excludeDeviceId } } : {}),
      ...(cursorRow
        ? {
            OR: [
              { createdAt: { gt: cursorRow.createdAt } },
              { createdAt: cursorRow.createdAt, id: { gt: cursorRow.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    tenantId: row.tenantId,
    tableName: row.tableName,
    recordId: row.recordId,
    operation: row.operation,
    payload: row.payload as Record<string, unknown>,
    recordVersion: row.recordVersion,
    sourceDeviceId: row.sourceDeviceId,
    createdAt: row.createdAt,
  }));
}
