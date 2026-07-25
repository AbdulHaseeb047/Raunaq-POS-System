import { Decimal } from '@prisma/client/runtime/library';

import { ConflictError, NotFoundError } from '../core/errors.js';
import { prisma } from '../core/prisma.js';
import type { TransactionClient } from '../core/prisma.js';
import { toDecimal } from '../core/money.js';

async function lockSupplierForUpdate(tx: TransactionClient, tenantId: string, supplierId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string; balance: Decimal }>>`
    SELECT id, balance FROM suppliers
    WHERE id = ${supplierId}::uuid AND tenant_id = ${tenantId}::uuid AND deleted_at IS NULL
    FOR UPDATE
  `;
  if (!rows[0]) throw new NotFoundError('Supplier not found');
  return rows[0];
}

export async function recordSupplierPurchase(
  tx: TransactionClient,
  params: {
    tenantId: string;
    supplierId: string;
    amount: Decimal;
    referenceType?: string;
    referenceId?: string;
    notes?: string;
    recordedById: string;
  },
) {
  if (params.amount.lte(0)) throw new ConflictError('Purchase amount must be positive');

  const supplier = await lockSupplierForUpdate(tx, params.tenantId, params.supplierId);
  const newBalance = supplier.balance.plus(params.amount);

  const entry = await tx.supplierLedgerEntry.create({
    data: {
      tenantId: params.tenantId,
      supplierId: params.supplierId,
      entryType: 'PURCHASE',
      amount: params.amount,
      balanceAfter: newBalance,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      notes: params.notes,
      recordedById: params.recordedById,
    },
  });

  await tx.supplier.update({
    where: { id: params.supplierId },
    data: { balance: newBalance },
  });

  return entry;
}

export async function recordSupplierPayment(
  tenantId: string,
  supplierId: string,
  amount: number,
  paymentMethod: string,
  notes: string | undefined,
  recordedById: string,
) {
  const payAmount = toDecimal(amount);
  if (payAmount.lte(0)) throw new ConflictError('Payment amount must be positive');

  return prisma.$transaction(async (tx) => {
    const supplier = await lockSupplierForUpdate(tx, tenantId, supplierId);
    if (payAmount.gt(supplier.balance)) {
      throw new ConflictError('Payment exceeds outstanding payable balance');
    }

    const newBalance = supplier.balance.minus(payAmount);
    const entry = await tx.supplierLedgerEntry.create({
      data: {
        tenantId,
        supplierId,
        entryType: 'PAYMENT',
        amount: payAmount.negated(),
        balanceAfter: newBalance,
        paymentMethod,
        notes,
        recordedById,
      },
    });

    await tx.supplier.update({
      where: { id: supplierId },
      data: { balance: newBalance },
    });

    return entry;
  });
}

export async function getSupplier(tenantId: string, supplierId: string) {
  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, tenantId, deletedAt: null },
  });
  if (!supplier) throw new NotFoundError('Supplier not found');
  return serializeSupplier(supplier);
}

export async function getSupplierLedger(tenantId: string, supplierId: string) {
  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, tenantId, deletedAt: null },
  });
  if (!supplier) throw new NotFoundError('Supplier not found');

  const entries = await prisma.supplierLedgerEntry.findMany({
    where: { tenantId, supplierId },
    orderBy: { createdAt: 'desc' },
    include: { recordedBy: { select: { id: true, fullName: true } } },
  });

  const movementIds = entries
    .filter((e) => e.referenceType === 'stock_in' && e.referenceId)
    .map((e) => e.referenceId!);

  const movements =
    movementIds.length > 0
      ? await prisma.stockMovement.findMany({
          where: { tenantId, id: { in: movementIds } },
          include: { product: { select: { id: true, name: true, unit: true, sku: true } } },
        })
      : [];

  const movementMap = new Map(movements.map((m) => [m.id, m]));

  return entries.map((e) => {
    const movement = e.referenceId ? movementMap.get(e.referenceId) : undefined;
    return {
      id: e.id,
      entryType: e.entryType,
      amount: e.amount.toFixed(2),
      balanceAfter: e.balanceAfter.toFixed(2),
      paymentMethod: e.paymentMethod,
      notes: e.notes,
      referenceType: e.referenceType,
      referenceId: e.referenceId,
      recordedBy: e.recordedBy,
      createdAt: e.createdAt.toISOString(),
      description:
        e.entryType === 'PURCHASE' && movement
          ? `Stock-in: ${movement.product.name}`
          : e.entryType === 'PAYMENT'
            ? `Payment${e.paymentMethod ? ` (${e.paymentMethod})` : ''}`
            : (e.notes ?? e.entryType),
      stockIn: movement
        ? {
            productId: movement.product.id,
            productName: movement.product.name,
            sku: movement.product.sku,
            unit: movement.product.unit,
            quantity: movement.quantityDelta.toFixed(3),
            notes: movement.notes,
          }
        : null,
    };
  });
}

export function serializeSupplier(s: {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  balance: { toFixed: (n: number) => string };
  isActive: boolean;
}) {
  return {
    id: s.id,
    name: s.name,
    phone: s.phone,
    email: s.email,
    address: s.address,
    notes: s.notes,
    balance: s.balance.toFixed(2),
    isActive: s.isActive,
  };
}
