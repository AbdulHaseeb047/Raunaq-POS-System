import type { SyncOperation } from '@prisma/client';

import type { TransactionClient } from '../core/prisma.js';
import { payloadToRow } from './payload-mapper.js';
import { SYNC_TABLES } from './sync-payload.js';

export type ApplyResult = 'applied' | 'skipped' | 'conflict';

export interface SyncChangeInput {
  tableName: string;
  recordId: string;
  operation: SyncOperation;
  payload: Record<string, unknown>;
  recordVersion: number;
}

const APPEND_ONLY_TABLES = new Set<string>([
  SYNC_TABLES.saleItems,
  SYNC_TABLES.salePayments,
  SYNC_TABLES.stockMovements,
  SYNC_TABLES.customerPaymentAllocations,
]);

const VERSIONED_TABLES = new Set<string>([
  SYNC_TABLES.sales,
  SYNC_TABLES.customerLedgerEntries,
  SYNC_TABLES.customerCreditObligations,
]);

const LWW_TABLES = new Set<string>([
  SYNC_TABLES.products,
  SYNC_TABLES.categories,
  SYNC_TABLES.customers,
  SYNC_TABLES.discountRules,
  SYNC_TABLES.branches,
  SYNC_TABLES.businessSettings,
]);

function rowVersion(row: { version?: number } | null): number {
  return row?.version ?? 0;
}

function rowUpdatedAt(row: { updatedAt?: Date } | null): number {
  return row?.updatedAt?.getTime() ?? 0;
}

async function findExisting(
  tx: TransactionClient,
  tableName: string,
  recordId: string,
): Promise<{ version?: number; updatedAt?: Date; id?: string } | null> {
  switch (tableName) {
    case SYNC_TABLES.sales:
      return tx.sale.findUnique({
        where: { id: recordId },
        select: { version: true, updatedAt: true },
      });
    case SYNC_TABLES.products:
      return tx.product.findUnique({
        where: { id: recordId },
        select: { version: true, updatedAt: true },
      });
    case SYNC_TABLES.categories:
      return tx.category.findUnique({
        where: { id: recordId },
        select: { version: true, updatedAt: true },
      });
    case SYNC_TABLES.customers:
      return tx.customer.findUnique({
        where: { id: recordId },
        select: { version: true, updatedAt: true },
      });
    case SYNC_TABLES.customerLedgerEntries:
      return tx.customerLedgerEntry.findUnique({
        where: { id: recordId },
        select: { version: true },
      });
    case SYNC_TABLES.customerCreditObligations:
      return tx.customerCreditObligation.findUnique({
        where: { id: recordId },
        select: { version: true },
      });
    case SYNC_TABLES.discountRules:
      return tx.discountRule.findUnique({
        where: { id: recordId },
        select: { version: true, updatedAt: true },
      });
    case SYNC_TABLES.branches:
      return tx.branch.findUnique({ where: { id: recordId }, select: { updatedAt: true } });
    case SYNC_TABLES.businessSettings:
      return tx.businessSettings.findUnique({
        where: { tenantId: recordId },
        select: { version: true, updatedAt: true },
      });
    case SYNC_TABLES.saleItems:
      return tx.saleItem.findUnique({ where: { id: recordId }, select: { id: true } });
    case SYNC_TABLES.salePayments:
      return tx.salePayment.findUnique({ where: { id: recordId }, select: { id: true } });
    case SYNC_TABLES.stockMovements:
      return tx.stockMovement.findUnique({ where: { id: recordId }, select: { id: true } });
    case SYNC_TABLES.customerPaymentAllocations:
      return tx.customerPaymentAllocation.findUnique({
        where: { id: recordId },
        select: { id: true },
      });
    default:
      return null;
  }
}

async function insertRow(
  tx: TransactionClient,
  tableName: string,
  data: Record<string, unknown>,
): Promise<void> {
  switch (tableName) {
    case SYNC_TABLES.sales:
      await tx.sale.create({ data: data as never });
      break;
    case SYNC_TABLES.saleItems:
      await tx.saleItem.create({ data: data as never });
      break;
    case SYNC_TABLES.salePayments:
      await tx.salePayment.create({ data: data as never });
      break;
    case SYNC_TABLES.products:
      await tx.product.create({ data: data as never });
      break;
    case SYNC_TABLES.categories:
      await tx.category.create({ data: data as never });
      break;
    case SYNC_TABLES.customers:
      await tx.customer.create({ data: { ...(data as object), balance: 0 } as never });
      break;
    case SYNC_TABLES.customerLedgerEntries:
      await tx.customerLedgerEntry.create({ data: data as never });
      break;
    case SYNC_TABLES.customerCreditObligations:
      await tx.customerCreditObligation.create({ data: data as never });
      break;
    case SYNC_TABLES.customerPaymentAllocations:
      await tx.customerPaymentAllocation.create({ data: data as never });
      break;
    case SYNC_TABLES.stockMovements:
      await tx.stockMovement.create({ data: data as never });
      break;
    case SYNC_TABLES.branches:
      await tx.branch.create({ data: data as never });
      break;
    case SYNC_TABLES.discountRules:
      await tx.discountRule.create({ data: data as never });
      break;
    case SYNC_TABLES.businessSettings:
      await tx.businessSettings.create({ data: data as never });
      break;
    default:
      throw new Error(`Unsupported sync table: ${tableName}`);
  }
}

async function updateRow(
  tx: TransactionClient,
  tableName: string,
  recordId: string,
  data: Record<string, unknown>,
): Promise<void> {
  switch (tableName) {
    case SYNC_TABLES.sales:
      await tx.sale.update({ where: { id: recordId }, data: data as never });
      break;
    case SYNC_TABLES.products:
      await tx.product.update({ where: { id: recordId }, data: data as never });
      break;
    case SYNC_TABLES.categories:
      await tx.category.update({ where: { id: recordId }, data: data as never });
      break;
    case SYNC_TABLES.customers:
      await tx.customer.update({ where: { id: recordId }, data: data as never });
      break;
    case SYNC_TABLES.customerLedgerEntries:
      await tx.customerLedgerEntry.update({ where: { id: recordId }, data: data as never });
      break;
    case SYNC_TABLES.customerCreditObligations:
      await tx.customerCreditObligation.update({ where: { id: recordId }, data: data as never });
      break;
    case SYNC_TABLES.discountRules:
      await tx.discountRule.update({ where: { id: recordId }, data: data as never });
      break;
    case SYNC_TABLES.branches:
      await tx.branch.update({ where: { id: recordId }, data: data as never });
      break;
    case SYNC_TABLES.businessSettings:
      await tx.businessSettings.update({ where: { tenantId: recordId }, data: data as never });
      break;
    default:
      throw new Error(`Unsupported sync update table: ${tableName}`);
  }
}

/**
 * Applies a single remote change without enqueueing to the local outbox.
 * Conflict strategies follow ARCHITECTURE.md §10.
 */
export async function applySyncChange(
  tx: TransactionClient,
  change: SyncChangeInput,
): Promise<{ result: ApplyResult; reason?: string }> {
  const { tableName, recordId, operation, payload, recordVersion } = change;
  const existing = await findExisting(tx, tableName, recordId);

  if (operation === 'DELETE') {
    return { result: 'skipped', reason: 'DELETE not implemented in Phase 1' };
  }

  const omitFields = tableName === SYNC_TABLES.customers ? ['balance'] : [];
  const row = payloadToRow(payload, { omit: omitFields });

  if (APPEND_ONLY_TABLES.has(tableName)) {
    if (existing) return { result: 'skipped', reason: 'already exists' };
    await insertRow(tx, tableName, row);
    return { result: 'applied' };
  }

  if (VERSIONED_TABLES.has(tableName)) {
    if (!existing) {
      await insertRow(tx, tableName, row);
      return { result: 'applied' };
    }
    if (operation === 'INSERT') {
      return { result: 'skipped', reason: 'already exists' };
    }
    if (recordVersion <= rowVersion(existing)) {
      return { result: 'skipped', reason: 'local version is newer or equal' };
    }
    await updateRow(tx, tableName, recordId, row);
    return { result: 'applied' };
  }

  if (LWW_TABLES.has(tableName)) {
    const remoteUpdatedAt = row.updatedAt instanceof Date ? row.updatedAt.getTime() : 0;
    if (!existing) {
      await insertRow(tx, tableName, row);
      return { result: 'applied' };
    }
    if (remoteUpdatedAt < rowUpdatedAt(existing)) {
      return { result: 'skipped', reason: 'local updated_at is newer' };
    }
    if (remoteUpdatedAt === rowUpdatedAt(existing) && recordVersion <= rowVersion(existing)) {
      return { result: 'skipped', reason: 'same timestamp, local version sufficient' };
    }
    await updateRow(tx, tableName, recordId, row);
    return { result: 'applied' };
  }

  return { result: 'conflict', reason: `unknown table ${tableName}` };
}
