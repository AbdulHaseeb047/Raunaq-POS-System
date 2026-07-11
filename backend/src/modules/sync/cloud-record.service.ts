import type { SyncOperation } from '@prisma/client';

import { NotFoundError } from '../core/errors.js';
import { prisma } from '../core/prisma.js';
import { serializeRecord } from './sync-payload.js';
import { SYNC_TABLES } from './sync-payload.js';

export interface CloudRecordSnapshot {
  tableName: string;
  recordId: string;
  operation: SyncOperation;
  payload: Record<string, unknown>;
  recordVersion: number;
}

async function loadRow(
  tableName: string,
  tenantId: string,
  recordId: string,
): Promise<Record<string, unknown> | null> {
  switch (tableName) {
    case SYNC_TABLES.sales:
      return prisma.sale.findFirst({ where: { id: recordId, tenantId } });
    case SYNC_TABLES.saleItems:
      return prisma.saleItem.findFirst({ where: { id: recordId, tenantId } });
    case SYNC_TABLES.salePayments:
      return prisma.salePayment.findFirst({ where: { id: recordId, tenantId } });
    case SYNC_TABLES.products:
      return prisma.product.findFirst({ where: { id: recordId, tenantId } });
    case SYNC_TABLES.categories:
      return prisma.category.findFirst({ where: { id: recordId, tenantId } });
    case SYNC_TABLES.customers:
      return prisma.customer.findFirst({ where: { id: recordId, tenantId } });
    case SYNC_TABLES.customerLedgerEntries:
      return prisma.customerLedgerEntry.findFirst({ where: { id: recordId, tenantId } });
    case SYNC_TABLES.customerCreditObligations:
      return prisma.customerCreditObligation.findFirst({ where: { id: recordId, tenantId } });
    case SYNC_TABLES.customerPaymentAllocations:
      return prisma.customerPaymentAllocation.findFirst({ where: { id: recordId, tenantId } });
    case SYNC_TABLES.stockMovements:
      return prisma.stockMovement.findFirst({ where: { id: recordId, tenantId } });
    case SYNC_TABLES.branches:
      return prisma.branch.findFirst({ where: { id: recordId, tenantId } });
    case SYNC_TABLES.discountRules:
      return prisma.discountRule.findFirst({ where: { id: recordId, tenantId } });
    case SYNC_TABLES.businessSettings:
      return prisma.businessSettings.findUnique({ where: { tenantId: recordId } });
    default:
      return null;
  }
}

/** Authoritative cloud row for dismiss / reconcile (cloud hub reads live DB). */
export async function getCloudRecord(
  tenantId: string,
  tableName: string,
  recordId: string,
): Promise<CloudRecordSnapshot | null> {
  const row = await loadRow(tableName, tenantId, recordId);
  if (!row) return null;

  const payload = serializeRecord(row) as Record<string, unknown>;
  const version = typeof row.version === 'number' ? row.version : 1;

  return {
    tableName,
    recordId,
    operation: 'UPDATE',
    payload,
    recordVersion: version,
  };
}

export async function getCloudRecordOrThrow(
  tenantId: string,
  tableName: string,
  recordId: string,
): Promise<CloudRecordSnapshot> {
  const record = await getCloudRecord(tenantId, tableName, recordId);
  if (!record) throw new NotFoundError('Remote record not found on cloud');
  return record;
}
