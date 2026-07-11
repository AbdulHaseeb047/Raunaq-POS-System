import type { Prisma } from '@prisma/client';

import type { TransactionClient } from '../core/prisma.js';

/**
 * Acquires an exclusive row lock on a customer before any ledger write.
 * Must be the first data access inside a ledger transaction (see docs/SCHEMA.md §9).
 *
 * Step 3: called by customers.service on every ledger entry path.
 */
export async function lockCustomerForUpdate(
  tx: TransactionClient,
  tenantId: string,
  customerId: string,
): Promise<{ id: string; balance: Prisma.Decimal }> {
  const rows = await tx.$queryRaw<{ id: string; balance: Prisma.Decimal }[]>`
    SELECT id, balance
    FROM customers
    WHERE id = ${customerId}::uuid
      AND tenant_id = ${tenantId}::uuid
      AND deleted_at IS NULL
    FOR UPDATE
  `;

  const customer = rows[0];
  if (!customer) {
    throw new Error(`Customer not found: ${customerId}`);
  }

  return customer;
}

/**
 * Recomputes customers.balance from non-voided ledger entries.
 * Used after sync reconciliation — never apply remote balance via LWW.
 *
 * Step 5: called by sync worker after applying ledger pulls.
 */
export async function recomputeCustomerBalance(
  tx: TransactionClient,
  tenantId: string,
  customerId: string,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE customers c
    SET balance = COALESCE((
      SELECT SUM(e.amount)
      FROM customer_ledger_entries e
      WHERE e.customer_id = c.id
        AND e.tenant_id = ${tenantId}::uuid
        AND e.voided_at IS NULL
    ), 0),
    updated_at = NOW()
    WHERE c.id = ${customerId}::uuid
      AND c.tenant_id = ${tenantId}::uuid
  `;
}
