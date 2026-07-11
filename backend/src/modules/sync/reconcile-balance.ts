import type { TransactionClient } from '../core/prisma.js';
import { prisma } from '../core/prisma.js';

/**
 * Recomputes customer balance from non-voided ledger entries.
 * Required after sync pull — never apply remote `customers.balance` directly.
 */
export async function recomputeCustomerBalance(
  tx: TransactionClient,
  tenantId: string,
  customerId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<{ balance: string }[]>`
    SELECT COALESCE(SUM(amount), 0)::text AS balance
    FROM customer_ledger_entries
    WHERE tenant_id = ${tenantId}::uuid
      AND customer_id = ${customerId}::uuid
      AND voided_at IS NULL
  `;

  await tx.customer.update({
    where: { id: customerId },
    data: { balance: rows[0]!.balance },
  });
}

export async function recomputeAllCustomerBalances(tenantId: string): Promise<number> {
  const customers = await prisma.customer.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    for (const customer of customers) {
      await recomputeCustomerBalance(tx, tenantId, customer.id);
    }
  });

  return customers.length;
}
