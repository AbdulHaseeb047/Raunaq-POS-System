import type { Prisma } from '@prisma/client';
import type { SyncOperation } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import type { TransactionClient } from '../core/prisma.js';
import { enqueueSyncOutbox, isSyncOutboxActive } from './outbox.service.js';

/** Live env check — must match `isSyncOutboxActive` (not frozen `appConfig`). */
export function syncOutboxEnabled(): boolean {
  return isSyncOutboxActive();
}

/** DB table names as stored in `sync_outbox.table_name`. */
export const SYNC_TABLES = {
  sales: 'sales',
  saleItems: 'sale_items',
  salePayments: 'sale_payments',
  products: 'products',
  categories: 'categories',
  customers: 'customers',
  customerLedgerEntries: 'customer_ledger_entries',
  customerCreditObligations: 'customer_credit_obligations',
  customerPaymentAllocations: 'customer_payment_allocations',
  stockMovements: 'stock_movements',
  branches: 'branches',
  businessSettings: 'business_settings',
  discountRules: 'discount_rules',
} as const;

function camelToSnake(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Decimal) return value.toString();
  return value;
}

/** Flat Prisma row → JSONB payload with snake_case column names. Skips nested objects. */
export function serializeRecord(record: Record<string, unknown>): Prisma.InputJsonValue {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (value === undefined) continue;
    if (
      value !== null &&
      typeof value === 'object' &&
      !(value instanceof Date) &&
      !(value instanceof Decimal)
    ) {
      continue;
    }
    out[camelToSnake(key)] = serializeValue(value);
  }

  return out as Prisma.InputJsonValue;
}

type SyncableRow = Record<string, unknown> & { id: string; tenantId?: string; version?: number };

export async function syncInsert(
  tx: TransactionClient,
  tableName: string,
  record: SyncableRow,
): Promise<void> {
  if (!syncOutboxEnabled()) return;
  const tenantId = record.tenantId;
  if (!tenantId) return;

  await enqueueSyncOutbox(tx, {
    tenantId,
    tableName,
    recordId: record.id,
    operation: 'INSERT' satisfies SyncOperation,
    payload: serializeRecord(record),
    recordVersion: record.version ?? 1,
  });
}

export async function syncUpdate(
  tx: TransactionClient,
  tableName: string,
  record: SyncableRow,
  options?: { recordId?: string },
): Promise<void> {
  if (!syncOutboxEnabled()) return;
  const tenantId = record.tenantId;
  if (!tenantId) return;

  await enqueueSyncOutbox(tx, {
    tenantId,
    tableName,
    recordId: options?.recordId ?? record.id,
    operation: 'UPDATE' satisfies SyncOperation,
    payload: serializeRecord(record),
    recordVersion: record.version ?? 1,
  });
}
