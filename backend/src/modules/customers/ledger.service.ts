import { Decimal } from '@prisma/client/runtime/library';

import { ConflictError, NotFoundError } from '../core/errors.js';
import { prisma } from '../core/prisma.js';
import type { TransactionClient } from '../core/prisma.js';
import { SYNC_TABLES, syncInsert, syncUpdate } from '../sync/sync-payload.js';
import { writeAuditLog } from '../audit/audit.service.js';
import { lockCustomerForUpdate } from '../customers/customer-lock.js';

export async function recordCreditSale(
  tx: TransactionClient,
  params: {
    tenantId: string;
    customerId: string;
    saleId: string;
    amount: Decimal;
    recordedById: string;
  },
): Promise<string> {
  const customer = await lockCustomerForUpdate(tx, params.tenantId, params.customerId);
  const newBalance = customer.balance.plus(params.amount);

  const entry = await tx.customerLedgerEntry.create({
    data: {
      tenantId: params.tenantId,
      customerId: params.customerId,
      entryType: 'CREDIT_SALE',
      amount: params.amount,
      balanceAfter: newBalance,
      saleId: params.saleId,
      recordedById: params.recordedById,
    },
  });

  const obligation = await tx.customerCreditObligation.create({
    data: {
      tenantId: params.tenantId,
      customerId: params.customerId,
      ledgerEntryId: entry.id,
      saleId: params.saleId,
      originalAmount: params.amount,
      remainingAmount: params.amount,
    },
  });

  await tx.customer.update({
    where: { id: params.customerId },
    data: { balance: newBalance },
  });

  await syncInsert(tx, SYNC_TABLES.customerLedgerEntries, entry);
  await syncInsert(tx, SYNC_TABLES.customerCreditObligations, obligation);

  return entry.id;
}

export async function recordPayment(
  tx: TransactionClient,
  params: {
    tenantId: string;
    customerId: string;
    amount: Decimal;
    paymentMethod: string;
    notes?: string;
    recordedById: string;
  },
): Promise<string> {
  if (params.amount.lte(0)) {
    throw new ConflictError('Payment amount must be positive');
  }

  const customer = await lockCustomerForUpdate(tx, params.tenantId, params.customerId);
  const paymentAmount = params.amount;
  const newBalance = customer.balance.minus(paymentAmount);

  if (newBalance.lt(0)) {
    throw new ConflictError('Payment exceeds customer balance');
  }

  const entry = await tx.customerLedgerEntry.create({
    data: {
      tenantId: params.tenantId,
      customerId: params.customerId,
      entryType: 'PAYMENT',
      amount: paymentAmount.negated(),
      balanceAfter: newBalance,
      paymentMethod: params.paymentMethod,
      notes: params.notes,
      recordedById: params.recordedById,
    },
  });

  let remaining = paymentAmount;
  const obligations = await tx.customerCreditObligation.findMany({
    where: {
      tenantId: params.tenantId,
      customerId: params.customerId,
      remainingAmount: { gt: 0 },
      closedAt: null,
    },
    orderBy: { createdAt: 'asc' },
  });

  for (const obligation of obligations) {
    if (remaining.lte(0)) break;

    const apply = Decimal.min(remaining, obligation.remainingAmount);
    const newRemaining = obligation.remainingAmount.minus(apply);

    const updatedObligation = await tx.customerCreditObligation.update({
      where: { id: obligation.id },
      data: {
        remainingAmount: newRemaining,
        closedAt: newRemaining.lte(0) ? new Date() : null,
      },
    });

    const allocation = await tx.customerPaymentAllocation.create({
      data: {
        tenantId: params.tenantId,
        ledgerEntryId: entry.id,
        obligationId: obligation.id,
        amount: apply,
      },
    });

    await syncUpdate(tx, SYNC_TABLES.customerCreditObligations, updatedObligation);
    await syncInsert(tx, SYNC_TABLES.customerPaymentAllocations, allocation);

    remaining = remaining.minus(apply);
  }

  await tx.customer.update({
    where: { id: params.customerId },
    data: { balance: newBalance },
  });

  await syncInsert(tx, SYNC_TABLES.customerLedgerEntries, entry);

  return entry.id;
}

export async function assertPaymentVoidAllowed(
  tx: TransactionClient,
  paymentEntryId: string,
): Promise<void> {
  const payment = await tx.customerLedgerEntry.findUnique({ where: { id: paymentEntryId } });
  if (!payment || payment.entryType !== 'PAYMENT') {
    throw new NotFoundError('Payment entry not found');
  }

  const allocations = await tx.customerPaymentAllocation.findMany({
    where: { ledgerEntryId: paymentEntryId },
    select: { obligationId: true },
  });

  const obligationIds = allocations.map((a) => a.obligationId);
  if (obligationIds.length === 0) return;

  const subsequent = await tx.customerPaymentAllocation.findFirst({
    where: {
      obligationId: { in: obligationIds },
      ledgerEntry: {
        entryType: 'PAYMENT',
        voidedAt: null,
        id: { not: paymentEntryId },
        createdAt: { gt: payment.createdAt },
      },
    },
  });

  if (subsequent) {
    throw new ConflictError(
      'Cannot void payment: allocated obligations have received subsequent payments',
      'PAYMENT_VOID_BLOCKED_SUBSEQUENT_PAYMENTS',
    );
  }
}

export async function voidLedgerEntry(
  tenantId: string,
  customerId: string,
  entryId: string,
  voidedById: string,
  voidReason: string,
  ipAddress?: string,
) {
  await prisma.$transaction(async (tx) => {
    const entry = await tx.customerLedgerEntry.findFirst({
      where: { id: entryId, tenantId, customerId, voidedAt: null },
    });

    if (!entry) throw new NotFoundError('Ledger entry not found');
    if (entry.saleId && entry.entryType === 'CREDIT_SALE') {
      throw new ConflictError('Void credit sales via POST /sales/:id/void');
    }

    if (entry.entryType === 'PAYMENT') {
      await assertPaymentVoidAllowed(tx, entryId);
    }

    await lockCustomerForUpdate(tx, tenantId, customerId);

    const voidedEntry = await tx.customerLedgerEntry.update({
      where: { id: entryId },
      data: { voidedAt: new Date(), voidedById, voidReason },
    });

    const reversalBalance = entry.balanceAfter.minus(entry.amount);
    const reversal = await tx.customerLedgerEntry.create({
      data: {
        tenantId,
        customerId,
        entryType: 'VOID_REVERSAL',
        amount: entry.amount.negated(),
        balanceAfter: reversalBalance,
        recordedById: voidedById,
        reversalOfId: entryId,
        notes: voidReason,
      },
    });

    await syncUpdate(tx, SYNC_TABLES.customerLedgerEntries, voidedEntry);
    await syncInsert(tx, SYNC_TABLES.customerLedgerEntries, reversal);

    if (entry.entryType === 'PAYMENT') {
      const allocations = await tx.customerPaymentAllocation.findMany({
        where: { ledgerEntryId: entryId },
      });

      for (const alloc of allocations) {
        const obligation = await tx.customerCreditObligation.findUnique({
          where: { id: alloc.obligationId },
        });
        if (!obligation) continue;

        const restored = obligation.remainingAmount.plus(alloc.amount);
        const updatedObligation = await tx.customerCreditObligation.update({
          where: { id: obligation.id },
          data: {
            remainingAmount: restored,
            closedAt: null,
          },
        });
        await syncUpdate(tx, SYNC_TABLES.customerCreditObligations, updatedObligation);
      }
    }

    if (entry.entryType === 'CREDIT_SALE') {
      const obligations = await tx.customerCreditObligation.findMany({
        where: { ledgerEntryId: entryId },
      });
      for (const obligation of obligations) {
        const updatedObligation = await tx.customerCreditObligation.update({
          where: { id: obligation.id },
          data: { remainingAmount: 0, closedAt: new Date() },
        });
        await syncUpdate(tx, SYNC_TABLES.customerCreditObligations, updatedObligation);
      }
    }

    await tx.customer.update({
      where: { id: customerId },
      data: { balance: reversalBalance },
    });

    await writeAuditLog({
      tenantId,
      userId: voidedById,
      action: 'ledger.entry_voided',
      entityType: 'customer_ledger_entry',
      entityId: entryId,
      metadata: { voidReason, entryType: entry.entryType },
      ipAddress,
    });
  });

  return { success: true };
}

export async function getCustomerLedger(tenantId: string, customerId: string) {
  return prisma.customerLedgerEntry.findMany({
    where: { tenantId, customerId },
    orderBy: { createdAt: 'desc' },
    include: {
      recordedBy: { select: { id: true, fullName: true } },
      sale: { select: { id: true, saleNumber: true, grandTotal: true, createdAt: true } },
      obligation: {
        select: {
          id: true,
          originalAmount: true,
          remainingAmount: true,
          createdAt: true,
          closedAt: true,
        },
      },
    },
  });
}

export async function getUdhaarAging(tenantId: string) {
  const obligations = await prisma.customerCreditObligation.findMany({
    where: { tenantId, remainingAmount: { gt: 0 }, closedAt: null },
    include: { customer: { select: { id: true, name: true, phone: true } } },
  });

  const now = Date.now();
  const buckets = new Map<
    string,
    {
      customerId: string;
      name: string;
      phone: string | null;
      bucket0_7: Decimal;
      bucket8_30: Decimal;
      bucket30Plus: Decimal;
    }
  >();

  for (const o of obligations) {
    const ageDays = Math.floor((now - o.createdAt.getTime()) / 86400000);
    const key = o.customerId;
    if (!buckets.has(key)) {
      buckets.set(key, {
        customerId: o.customerId,
        name: o.customer.name,
        phone: o.customer.phone,
        bucket0_7: new Decimal(0),
        bucket8_30: new Decimal(0),
        bucket30Plus: new Decimal(0),
      });
    }
    const row = buckets.get(key)!;
    if (ageDays <= 7) row.bucket0_7 = row.bucket0_7.plus(o.remainingAmount);
    else if (ageDays <= 30) row.bucket8_30 = row.bucket8_30.plus(o.remainingAmount);
    else row.bucket30Plus = row.bucket30Plus.plus(o.remainingAmount);
  }

  return [...buckets.values()].map((r) => ({
    customerId: r.customerId,
    name: r.name,
    phone: r.phone,
    bucket0_7: r.bucket0_7.toFixed(2),
    bucket8_30: r.bucket8_30.toFixed(2),
    bucket30_plus: r.bucket30Plus.toFixed(2),
    total: r.bucket0_7.plus(r.bucket8_30).plus(r.bucket30Plus).toFixed(2),
  }));
}
