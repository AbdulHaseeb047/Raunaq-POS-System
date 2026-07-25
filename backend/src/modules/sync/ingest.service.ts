import type { Prisma } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../core/prisma.js';
import { applySyncChange } from './apply-change.js';
import { appendChangelog } from './changelog.service.js';
import { assertSyncDeviceBinding, type AuthenticatedSyncDevice } from './sync-device.service.js';

const ingestEntrySchema = z.object({
  outboxId: z.string().uuid(),
  tableName: z.string().min(1).max(100),
  recordId: z.string().uuid(),
  operation: z.enum(['INSERT', 'UPDATE', 'DELETE']),
  payload: z.record(z.unknown()),
  recordVersion: z.number().int().positive(),
  createdAt: z.string().datetime().optional(),
});

export const ingestRequestSchema = z.object({
  tenantId: z.string().uuid(),
  deviceId: z.string().min(1).max(100),
  entries: z.array(ingestEntrySchema).min(1).max(100),
});

export type IngestRequest = z.infer<typeof ingestRequestSchema>;

export interface IngestEntryResult {
  outboxId: string;
  status: 'accepted' | 'skipped' | 'conflict' | 'failed';
  reason?: string;
}

export async function ingestRemoteChanges(
  request: IngestRequest,
  device: AuthenticatedSyncDevice,
): Promise<IngestEntryResult[]> {
  assertSyncDeviceBinding(device, request.tenantId, request.deviceId);

  const results: IngestEntryResult[] = [];

  for (const entry of request.entries) {
    try {
      const outcome = await prisma.$transaction(async (tx) => {
        const applyResult = await applySyncChange(tx, {
          tableName: entry.tableName,
          recordId: entry.recordId,
          operation: entry.operation,
          payload: entry.payload,
          recordVersion: entry.recordVersion,
        });

        if (applyResult.result === 'conflict') {
          return applyResult;
        }

        if (applyResult.result === 'applied') {
          await appendChangelog(tx, {
            tenantId: request.tenantId,
            tableName: entry.tableName,
            recordId: entry.recordId,
            operation: entry.operation,
            payload: entry.payload as Prisma.InputJsonValue,
            recordVersion: entry.recordVersion,
            sourceDeviceId: request.deviceId,
            sourceOutboxId: entry.outboxId,
          });
        }

        return applyResult;
      });

      results.push({
        outboxId: entry.outboxId,
        status:
          outcome.result === 'conflict'
            ? 'conflict'
            : outcome.result === 'applied'
              ? 'accepted'
              : 'skipped',
        reason: outcome.reason,
      });
    } catch (error) {
      results.push({
        outboxId: entry.outboxId,
        status: 'failed',
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}
