import { Decimal } from '@prisma/client/runtime/library';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createSale, voidSale } from '../billing/billing.service.js';
import { ConflictError } from '../core/errors.js';
import { prisma } from '../core/prisma.js';
import {
  cleanupCustomer,
  cleanupTestFixture,
  createTestCustomer,
  createTestFixture,
  hasTestDatabase,
  type TestFixture,
} from '../../test/db-fixtures.js';
import { recordPayment, voidLedgerEntry } from './ledger.service.js';

const describeIfDb = hasTestDatabase() ? describe : describe.skip;

describeIfDb('udhaar ledger integration', () => {
  let fixture: TestFixture;
  let customerId: string;

  beforeAll(async () => {
    fixture = await createTestFixture();
  });

  afterAll(async () => {
    await cleanupTestFixture(fixture.tenantId);
  });

  afterEach(async () => {
    if (customerId) {
      await cleanupCustomer(fixture.tenantId, customerId);
      customerId = '';
    }
  });

  async function creditSale(amount: number, unitPrice = amount) {
    return createSale(
      fixture.tenantId,
      fixture.userId,
      {
        customerId,
        paymentMethod: 'CREDIT',
        items: [{ productId: fixture.productId, quantity: 1, unitPrice }],
      },
      { branchId: fixture.branchId },
    );
  }

  it('credit sale creates obligation and updates balance', async () => {
    const customer = await createTestCustomer(fixture.tenantId);
    customerId = customer.id;

    await creditSale(250);

    const updated = await prisma.customer.findUnique({ where: { id: customerId } });
    expect(updated!.balance.toFixed(2)).toBe('250.00');

    const obligations = await prisma.customerCreditObligation.findMany({
      where: { customerId, closedAt: null },
    });
    expect(obligations).toHaveLength(1);
    expect(obligations[0]!.remainingAmount.toFixed(2)).toBe('250.00');

    const entries = await prisma.customerLedgerEntry.findMany({
      where: { customerId, voidedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.entryType).toBe('CREDIT_SALE');
    expect(entries[0]!.amount.toFixed(2)).toBe('250.00');
  });

  it('payment applies FIFO to oldest obligations first', async () => {
    const customer = await createTestCustomer(fixture.tenantId);
    customerId = customer.id;

    await creditSale(100);
    await creditSale(200);

    let updated = await prisma.customer.findUnique({ where: { id: customerId } });
    expect(updated!.balance.toFixed(2)).toBe('300.00');

    await prisma.$transaction((tx) =>
      recordPayment(tx, {
        tenantId: fixture.tenantId,
        customerId,
        amount: new Decimal(150),
        paymentMethod: 'cash',
        recordedById: fixture.userId,
      }),
    );

    updated = await prisma.customer.findUnique({ where: { id: customerId } });
    expect(updated!.balance.toFixed(2)).toBe('150.00');

    const obligations = await prisma.customerCreditObligation.findMany({
      where: { customerId },
      orderBy: { createdAt: 'asc' },
    });
    expect(obligations[0]!.remainingAmount.toFixed(2)).toBe('0.00');
    expect(obligations[0]!.closedAt).not.toBeNull();
    expect(obligations[1]!.remainingAmount.toFixed(2)).toBe('150.00');
    expect(obligations[1]!.closedAt).toBeNull();

    const paymentEntry = await prisma.customerLedgerEntry.findFirst({
      where: { customerId, entryType: 'PAYMENT', voidedAt: null },
    });
    const allocations = await prisma.customerPaymentAllocation.findMany({
      where: { ledgerEntryId: paymentEntry!.id },
      orderBy: { createdAt: 'asc' },
      include: { obligation: true },
    });
    expect(allocations).toHaveLength(2);
    expect(allocations[0]!.amount.toFixed(2)).toBe('100.00');
    expect(allocations[0]!.obligationId).toBe(obligations[0]!.id);
    expect(allocations[1]!.amount.toFixed(2)).toBe('50.00');
    expect(allocations[1]!.obligationId).toBe(obligations[1]!.id);
  });

  it('void sale reverses credit ledger entry and closes obligation', async () => {
    const customer = await createTestCustomer(fixture.tenantId);
    customerId = customer.id;

    const { sale } = await creditSale(180);

    await voidSale(fixture.tenantId, sale.id, fixture.userId, 'customer returned goods');

    const updated = await prisma.customer.findUnique({ where: { id: customerId } });
    expect(updated!.balance.toFixed(2)).toBe('0.00');

    const obligations = await prisma.customerCreditObligation.findMany({ where: { customerId } });
    expect(obligations[0]!.remainingAmount.toFixed(2)).toBe('0.00');
    expect(obligations[0]!.closedAt).not.toBeNull();

    const creditEntry = await prisma.customerLedgerEntry.findFirst({
      where: { customerId, entryType: 'CREDIT_SALE' },
    });
    expect(creditEntry!.voidedAt).not.toBeNull();

    const reversal = await prisma.customerLedgerEntry.findFirst({
      where: { customerId, entryType: 'VOID_REVERSAL' },
    });
    expect(reversal!.amount.toFixed(2)).toBe('-180.00');
  });

  it('sale → payment → FIFO allocation → void payment restores obligations', async () => {
    const customer = await createTestCustomer(fixture.tenantId);
    customerId = customer.id;

    await creditSale(100);
    await creditSale(200);

    await prisma.$transaction((tx) =>
      recordPayment(tx, {
        tenantId: fixture.tenantId,
        customerId,
        amount: new Decimal(150),
        paymentMethod: 'cash',
        recordedById: fixture.userId,
      }),
    );

    const paymentEntry = await prisma.customerLedgerEntry.findFirst({
      where: { customerId, entryType: 'PAYMENT', voidedAt: null },
    });

    await voidLedgerEntry(
      fixture.tenantId,
      customerId,
      paymentEntry!.id,
      fixture.userId,
      'payment recorded in error',
    );

    const updated = await prisma.customer.findUnique({ where: { id: customerId } });
    expect(updated!.balance.toFixed(2)).toBe('300.00');

    const obligations = await prisma.customerCreditObligation.findMany({
      where: { customerId },
      orderBy: { createdAt: 'asc' },
    });
    expect(obligations[0]!.remainingAmount.toFixed(2)).toBe('100.00');
    expect(obligations[0]!.closedAt).toBeNull();
    expect(obligations[1]!.remainingAmount.toFixed(2)).toBe('200.00');
    expect(obligations[1]!.closedAt).toBeNull();

    const voidedPayment = await prisma.customerLedgerEntry.findUnique({
      where: { id: paymentEntry!.id },
    });
    expect(voidedPayment!.voidedAt).not.toBeNull();
  });

  it('blocks payment void when a later payment touched the same obligations', async () => {
    const customer = await createTestCustomer(fixture.tenantId);
    customerId = customer.id;

    await creditSale(200);

    let firstPaymentId = '';
    await prisma.$transaction(async (tx) => {
      firstPaymentId = await recordPayment(tx, {
        tenantId: fixture.tenantId,
        customerId,
        amount: new Decimal(50),
        paymentMethod: 'cash',
        recordedById: fixture.userId,
      });
    });

    await prisma.$transaction((tx) =>
      recordPayment(tx, {
        tenantId: fixture.tenantId,
        customerId,
        amount: new Decimal(30),
        paymentMethod: 'cash',
        recordedById: fixture.userId,
      }),
    );

    await expect(
      voidLedgerEntry(
        fixture.tenantId,
        customerId,
        firstPaymentId,
        fixture.userId,
        'should be blocked',
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
