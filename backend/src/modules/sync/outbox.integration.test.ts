import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createSale } from '../billing/billing.service.js';
import { prisma } from '../core/prisma.js';
import { isSyncOutboxActive } from '../sync/outbox.service.js';
import { SYNC_TABLES } from '../sync/sync-payload.js';
import {
  cleanupTestFixture,
  createTestCustomer,
  createTestFixture,
  hasTestDatabase,
  type TestFixture,
} from '../../test/db-fixtures.js';

const describeIfDb = hasTestDatabase() ? describe : describe.skip;

describeIfDb('sync outbox integration', () => {
  let fixture: TestFixture;
  let previousDeploymentMode: string | undefined;

  beforeAll(async () => {
    previousDeploymentMode = process.env.DEPLOYMENT_MODE;
    process.env.DEPLOYMENT_MODE = 'hybrid';
    fixture = await createTestFixture();
  });

  afterAll(async () => {
    await cleanupTestFixture(fixture.tenantId);
    if (previousDeploymentMode === undefined) {
      delete process.env.DEPLOYMENT_MODE;
    } else {
      process.env.DEPLOYMENT_MODE = previousDeploymentMode;
    }
  });

  it('enqueues sale-related rows when DEPLOYMENT_MODE=hybrid', async () => {
    expect(isSyncOutboxActive()).toBe(true);

    const customer = await createTestCustomer(fixture.tenantId);

    await createSale(
      fixture.tenantId,
      fixture.userId,
      {
        customerId: customer.id,
        paymentMethod: 'CASH',
        amountReceived: 50,
        items: [{ productId: fixture.productId, quantity: 1, unitPrice: 50 }],
      },
      { branchId: fixture.branchId },
    );

    const pending = await prisma.syncOutbox.findMany({
      where: { tenantId: fixture.tenantId, status: 'PENDING' },
    });

    const tables = pending.map((row) => row.tableName);
    expect(tables).toContain(SYNC_TABLES.sales);
    expect(tables).toContain(SYNC_TABLES.saleItems);
    expect(tables).toContain(SYNC_TABLES.salePayments);
    expect(pending.length).toBeGreaterThanOrEqual(3);
  });

  it('does not enqueue when deployment mode is offline', async () => {
    process.env.DEPLOYMENT_MODE = 'offline';
    expect(isSyncOutboxActive()).toBe(false);

    const customer = await createTestCustomer(fixture.tenantId);
    const beforeCount = await prisma.syncOutbox.count({ where: { tenantId: fixture.tenantId } });

    await createSale(fixture.tenantId, fixture.userId, {
      customerId: customer.id,
      paymentMethod: 'CASH',
      amountReceived: 25,
      items: [{ productId: fixture.productId, quantity: 1, unitPrice: 25 }],
    });

    const afterCount = await prisma.syncOutbox.count({ where: { tenantId: fixture.tenantId } });
    expect(afterCount).toBe(beforeCount);

    process.env.DEPLOYMENT_MODE = 'hybrid';
  });
});
