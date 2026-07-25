import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '../core/prisma.js';
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
    const cloudUpdatedAt = new Date(Date.now() + 60_000).toISOString();

    await prisma.customer.create({
      data: {
        id: customerId,
        tenantId: fixture.tenantId,
        name: 'Stale Local',
        balance: 0,
        version: 1,
      },
    });

    const remote = {
      tableName: SYNC_TABLES.customers,
      recordId: customerId,
      operation: 'UPDATE' as const,
      payload: {
        id: customerId,
        tenant_id: fixture.tenantId,
        name: 'Cloud Authoritative',
        balance: '0',
        version: 2,
        updated_at: cloudUpdatedAt,
        created_at: cloudUpdatedAt,
        is_active: true,
      },
      recordVersion: 2,
    };

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
