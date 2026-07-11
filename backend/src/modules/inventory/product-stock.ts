import type { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { ConflictError } from '../core/errors.js';
import type { TransactionClient } from '../core/prisma.js';

/**
 * Atomically decrements tenant-wide stock on `products.stock_quantity`.
 * Phase 1 uses shared inventory across branches; `branch_id` on stock_movements
 * records which branch triggered the movement for reporting only.
 * Per-branch inventory would require a `branch_stock` table (future add-on).
 */
export async function decrementProductStock(
  tx: TransactionClient,
  params: {
    tenantId: string;
    productId: string;
    quantity: Decimal;
    productName: string;
  },
): Promise<Decimal> {
  const rows = await tx.$queryRaw<{ stock_quantity: Prisma.Decimal }[]>`
    UPDATE products
    SET stock_quantity = stock_quantity - ${params.quantity},
        updated_at = NOW(),
        version = version + 1
    WHERE id = ${params.productId}::uuid
      AND tenant_id = ${params.tenantId}::uuid
      AND deleted_at IS NULL
      AND track_stock = true
      AND stock_quantity >= ${params.quantity}
    RETURNING stock_quantity
  `;

  if (!rows[0]) {
    throw new ConflictError(`Insufficient stock for ${params.productName}`);
  }

  return rows[0].stock_quantity;
}

/**
 * Atomically increments stock (e.g. sale void / stock return).
 */
export async function incrementProductStock(
  tx: TransactionClient,
  params: {
    tenantId: string;
    productId: string;
    quantity: Decimal;
  },
): Promise<Decimal> {
  const rows = await tx.$queryRaw<{ stock_quantity: Prisma.Decimal }[]>`
    UPDATE products
    SET stock_quantity = stock_quantity + ${params.quantity},
        updated_at = NOW(),
        version = version + 1
    WHERE id = ${params.productId}::uuid
      AND tenant_id = ${params.tenantId}::uuid
      AND deleted_at IS NULL
      AND track_stock = true
    RETURNING stock_quantity
  `;

  if (!rows[0]) {
    throw new ConflictError('Product not found or stock not tracked');
  }

  return rows[0].stock_quantity;
}
