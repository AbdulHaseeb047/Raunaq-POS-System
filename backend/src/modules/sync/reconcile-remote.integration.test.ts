import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '../core/prisma.js';
import { getCloudRecord } from './cloud-record.service.js';
import { reconcileLocalWithRemote } from './reconcile-remote.service.js';
import { SYNC_TABLES } from './sync-payload.js';
import {
  cleanupTestFixture,
  createTestFixture,
  hasTestDatabase,
  type TestFixture,
} from '../../test/db-fixtures.js';

const describeIfDb = hasTestDatabase() ? describe : describe.skip;

describeIfDb('reconcile local with remote', () => {
  let fixture: TestFixture;

  beforeAll(async () => {
    fixture = await createTestFixture();
  });

  afterAll(async () => {
    await cleanupTestFixture(fixture.tenantId);
  });

  it('overwrites local customer with cloud snapshot on dismiss reconcile', async () => {
    const customerId = crypto.randomUUID();

    await prisma.customer.create({
      data: {
        id: customerId,
        tenantId: fixture.tenantId,
        name: 'Local Name',
        balance: 0,
      },
    });

    await prisma.customer.update({
      where: { id: customerId },
      data: { name: 'Cloud Authoritative', version: 2 },
    });

    const remote = await getCloudRecord(fixture.tenantId, SYNC_TABLES.customers, customerId);
    expect(remote).not.toBeNull();

    await prisma.customer.update({
      where: { id: customerId },
      data: { name: 'Stale Local' },
    });

    await prisma.$transaction(async (tx) => {
      await reconcileLocalWithRemote(
        tx,
        fixture.tenantId,
        {
          tableName: SYNC_TABLES.customers,
          recordId: customerId,
          operation: 'UPDATE',
          payload: { name: 'Stale Local' },
        },
        remote,
      );
    });

    const updated = await prisma.customer.findUnique({ where: { id: customerId } });
    expect(updated?.name).toBe('Cloud Authoritative');
  });
});
