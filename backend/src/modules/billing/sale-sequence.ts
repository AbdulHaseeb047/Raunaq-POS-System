import type { TransactionClient } from '../core/prisma.js';

/**
 * Atomically increments and returns the next sale number for a tenant.
 * Single UPSERT ... RETURNING — safe under concurrent sales.
 */
export async function nextSaleNumber(tx: TransactionClient, tenantId: string): Promise<string> {
  const rows = await tx.$queryRaw<{ last_number: bigint }[]>`
    INSERT INTO sale_sequences (tenant_id, last_number)
    VALUES (${tenantId}::uuid, 1)
    ON CONFLICT (tenant_id) DO UPDATE
      SET last_number = sale_sequences.last_number + 1
    RETURNING last_number
  `;

  const num = Number(rows[0]!.last_number);
  return `S-${String(num).padStart(6, '0')}`;
}
