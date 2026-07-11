import type { SyncOutbox } from '@prisma/client';

import type { TransactionClient } from '../core/prisma.js';
import { applySyncChange } from './apply-change.js';
import type { CloudRecordSnapshot } from './cloud-record.service.js';
import { recomputeCustomerBalance } from './reconcile-balance.js';
import { SYNC_TABLES } from './sync-payload.js';

const LEDGER_TABLES = new Set<string>([
  SYNC_TABLES.customerLedgerEntries,
  SYNC_TABLES.customerPaymentAllocations,
  SYNC_TABLES.customerCreditObligations,
]);

function customerIdFromPayload(payload: Record<string, unknown>): string | null {
  const id = payload.customer_id ?? payload.customerId;
  return typeof id === 'string' ? id : null;
}

async function deleteLocalRecord(
  tx: TransactionClient,
  tenantId: string,
  tableName: string,
  recordId: string,
): Promise<void> {
  switch (tableName) {
    case SYNC_TABLES.saleItems:
      await tx.saleItem.deleteMany({ where: { id: recordId, tenantId } });
      break;
    case SYNC_TABLES.salePayments:
      await tx.salePayment.deleteMany({ where: { id: recordId, tenantId } });
      break;
    case SYNC_TABLES.stockMovements:
      await tx.stockMovement.deleteMany({ where: { id: recordId, tenantId } });
      break;
    case SYNC_TABLES.customerPaymentAllocations:
      await tx.customerPaymentAllocation.deleteMany({ where: { id: recordId, tenantId } });
      break;
    case SYNC_TABLES.customerCreditObligations:
      await tx.customerCreditObligation.deleteMany({ where: { id: recordId, tenantId } });
      break;
    case SYNC_TABLES.customerLedgerEntries:
      await tx.customerLedgerEntry.deleteMany({ where: { id: recordId, tenantId } });
      break;
    case SYNC_TABLES.sales:
      await tx.sale.deleteMany({ where: { id: recordId, tenantId } });
      break;
    case SYNC_TABLES.products:
      await tx.product.deleteMany({ where: { id: recordId, tenantId } });
      break;
    case SYNC_TABLES.categories:
      await tx.category.deleteMany({ where: { id: recordId, tenantId } });
      break;
    case SYNC_TABLES.customers:
      await tx.customer.deleteMany({ where: { id: recordId, tenantId } });
      break;
    case SYNC_TABLES.discountRules:
      await tx.discountRule.deleteMany({ where: { id: recordId, tenantId } });
      break;
    case SYNC_TABLES.branches:
      await tx.branch.deleteMany({ where: { id: recordId, tenantId } });
      break;
    default:
      break;
  }
}

export type ReconcileOutcome = 'applied_remote' | 'rolled_back_local' | 'unchanged';

/**
 * Aligns local DB with cloud authority for a single outbox row.
 * - Remote exists → apply cloud snapshot locally (overwrite / merge per table rules).
 * - Remote missing + local was INSERT → remove unsynced local row (rollback).
 */
export async function reconcileLocalWithRemote(
  tx: TransactionClient,
  tenantId: string,
  outboxRow: Pick<SyncOutbox, 'tableName' | 'recordId' | 'operation' | 'payload'>,
  remote: CloudRecordSnapshot | null,
): Promise<ReconcileOutcome> {
  const touchedCustomers = new Set<string>();

  if (remote) {
    await applySyncChange(tx, {
      tableName: remote.tableName,
      recordId: remote.recordId,
      operation: remote.operation,
      payload: remote.payload,
      recordVersion: remote.recordVersion,
    });

    if (LEDGER_TABLES.has(remote.tableName)) {
      const customerId = customerIdFromPayload(remote.payload);
      if (customerId) touchedCustomers.add(customerId);
    }

    for (const customerId of touchedCustomers) {
      await recomputeCustomerBalance(tx, tenantId, customerId);
    }

    return 'applied_remote';
  }

  if (outboxRow.operation === 'INSERT') {
    const payload = outboxRow.payload as Record<string, unknown>;
    if (LEDGER_TABLES.has(outboxRow.tableName)) {
      const customerId = customerIdFromPayload(payload);
      if (customerId) touchedCustomers.add(customerId);
    }

    await deleteLocalRecord(tx, tenantId, outboxRow.tableName, outboxRow.recordId);

    for (const customerId of touchedCustomers) {
      await recomputeCustomerBalance(tx, tenantId, customerId);
    }

    return 'rolled_back_local';
  }

  return 'unchanged';
}

export function nextFailedPushState(
  retryCount: number,
  maxRetries: number,
  reason: string,
): { status: 'FAILED' | 'CONFLICT'; retryCount: number; errorMessage: string } {
  const next = retryCount + 1;
  if (next >= maxRetries) {
    return {
      status: 'CONFLICT',
      retryCount: next,
      errorMessage: `max retries (${maxRetries}) exceeded: ${reason}`,
    };
  }
  return { status: 'FAILED', retryCount: next, errorMessage: reason };
}
