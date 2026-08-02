import { z } from 'zod';

import { NotFoundError, ValidationError } from '../core/errors.js';
import { prisma } from '../core/prisma.js';
import { toDecimal } from '../core/money.js';
import { assertUniqueCompactName, findIdsByCompactSearch } from '../core/text-match.js';
import {
  getCustomerLedger,
  getUdhaarAging,
  recordPayment,
  voidLedgerEntry,
} from './ledger.service.js';
import { SYNC_TABLES, syncInsert, syncUpdate } from '../sync/sync-payload.js';

export const customerSchema = z.object({
  name: z.string().min(1).max(255),
  phone: z.string().max(20).optional().nullable(),
  email: z.string().email().optional().nullable(),
  address: z.string().optional().nullable(),
  creditLimit: z.number().nonnegative().optional().nullable(),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const recordPaymentSchema = z.object({
  amount: z.number().positive(),
  paymentMethod: z.enum(['cash', 'card', 'bank_transfer']).default('cash'),
  notes: z.string().optional(),
});

export async function listCustomers(
  tenantId: string,
  search?: string,
  page = 1,
  pageSize = 50,
  sortBy?: 'name' | 'balance',
  _from?: string,
  _to?: string,
) {
  const skip = (page - 1) * pageSize;
  const searchIds = await findIdsByCompactSearch(
    'customers',
    tenantId,
    search ?? '',
    ['phone'],
    null,
  );

  if (searchIds && searchIds.length === 0) {
    return {
      data: [],
      meta: { total: 0, page, pageSize, totalPages: 0 },
    };
  }

  const where = {
    tenantId,
    deletedAt: null,
    ...(searchIds ? { id: { in: searchIds } } : {}),
  };

  const orderBy = sortBy === 'balance' ? { balance: 'desc' as const } : { name: 'asc' as const };

  const [data, total] = await prisma.$transaction([
    prisma.customer.findMany({ where, skip, take: pageSize, orderBy }),
    prisma.customer.count({ where }),
  ]);

  return {
    data: data.map(serializeCustomer),
    meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
  };
}

export async function getCustomer(tenantId: string, id: string) {
  const customer = await prisma.customer.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!customer) throw new NotFoundError('Customer not found');
  return serializeCustomer(customer);
}

export async function createCustomer(tenantId: string, input: z.infer<typeof customerSchema>) {
  const name = input.name.trim();
  await assertUniqueCompactName('customers', tenantId, name, 'customer');

  const customer = await prisma.$transaction(async (tx) => {
    const created = await tx.customer.create({
      data: {
        tenantId,
        name,
        phone: input.phone ?? null,
        email: input.email ?? null,
        address: input.address ?? null,
        creditLimit: input.creditLimit != null ? toDecimal(input.creditLimit) : null,
        notes: input.notes ?? null,
        isActive: input.isActive ?? true,
      },
    });
    await syncInsert(tx, SYNC_TABLES.customers, created);
    return created;
  });
  return serializeCustomer(customer);
}

export async function updateCustomer(
  tenantId: string,
  id: string,
  input: Partial<z.infer<typeof customerSchema>>,
) {
  const existing = await prisma.customer.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!existing) throw new NotFoundError('Customer not found');

  const name = input.name?.trim();
  if (name) {
    await assertUniqueCompactName('customers', tenantId, name, 'customer', id);
  }

  const customer = await prisma.$transaction(async (tx) => {
    const updated = await tx.customer.update({
      where: { id },
      data: {
        name,
        phone: input.phone,
        email: input.email,
        address: input.address,
        creditLimit: input.creditLimit != null ? toDecimal(input.creditLimit) : undefined,
        notes: input.notes,
        isActive: input.isActive,
      },
    });
    await syncUpdate(tx, SYNC_TABLES.customers, updated);
    return updated;
  });
  return serializeCustomer(customer);
}

export async function deleteCustomer(tenantId: string, id: string) {
  const existing = await prisma.customer.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!existing) throw new NotFoundError('Customer not found');

  if (existing.balance.gt(0)) {
    throw new ValidationError(
      `Cannot delete customer with outstanding udhaar of ${existing.balance.toFixed(2)}. Clear the balance first.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.customer.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await syncUpdate(tx, SYNC_TABLES.customers, updated);
  });

  return { success: true };
}

export async function recordCustomerPayment(
  tenantId: string,
  customerId: string,
  input: z.infer<typeof recordPaymentSchema>,
  recordedById: string,
) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId, deletedAt: null },
  });
  if (!customer) throw new NotFoundError('Customer not found');

  await prisma.$transaction((tx) =>
    recordPayment(tx, {
      tenantId,
      customerId,
      amount: toDecimal(input.amount),
      paymentMethod: input.paymentMethod,
      notes: input.notes,
      recordedById,
    }),
  );

  return getCustomer(tenantId, customerId);
}

export async function fetchCustomerLedger(tenantId: string, customerId: string) {
  await getCustomer(tenantId, customerId);
  const entries = await getCustomerLedger(tenantId, customerId);
  const now = Date.now();
  return entries.map((e) => {
    const remaining = e.obligation?.remainingAmount ? Number(e.obligation.remainingAmount) : 0;
    const dueDate = e.obligation?.createdAt ?? e.sale?.createdAt ?? null;
    const daysOutstanding =
      dueDate && remaining > 0
        ? Math.max(0, Math.floor((now - dueDate.getTime()) / 86400000))
        : null;

    return {
      id: e.id,
      entryType: e.entryType,
      amount: e.amount.toFixed(2),
      balanceAfter: e.balanceAfter.toFixed(2),
      paymentMethod: e.paymentMethod,
      notes: e.notes,
      voidedAt: e.voidedAt?.toISOString() ?? null,
      recordedBy: e.recordedBy,
      createdAt: e.createdAt.toISOString(),
      saleId: e.saleId,
      saleNumber: e.sale?.saleNumber ?? null,
      saleTotal: e.sale?.grandTotal.toFixed(2) ?? null,
      dueDate: dueDate?.toISOString() ?? null,
      daysOutstanding,
      remainingAmount: e.obligation ? e.obligation.remainingAmount.toFixed(2) : null,
      description:
        e.entryType === 'CREDIT_SALE' && e.sale
          ? `Sale ${e.sale.saleNumber}`
          : e.entryType === 'PAYMENT'
            ? `Payment received${e.paymentMethod ? ` (${e.paymentMethod})` : ''}`
            : (e.notes ?? e.entryType.replaceAll('_', ' ')),
    };
  });
}

export async function voidCustomerLedgerEntry(
  tenantId: string,
  customerId: string,
  entryId: string,
  voidedById: string,
  voidReason: string,
  ipAddress?: string,
) {
  return voidLedgerEntry(tenantId, customerId, entryId, voidedById, voidReason, ipAddress);
}

export { getUdhaarAging };

function serializeCustomer(c: {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  creditLimit: { toFixed: (n: number) => string } | null;
  balance: { toFixed: (n: number) => string };
  notes: string | null;
  isActive: boolean;
}) {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    address: c.address,
    creditLimit: c.creditLimit?.toFixed(2) ?? null,
    balance: c.balance.toFixed(2),
    notes: c.notes,
    isActive: c.isActive,
  };
}
