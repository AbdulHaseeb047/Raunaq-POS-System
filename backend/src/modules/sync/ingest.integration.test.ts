import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '../core/prisma.js';
import { ingestRemoteChanges } from './ingest.service.js';
import { SYNC_TABLES } from './sync-payload.js';
import { registerSyncDevice, authenticateSyncDevice } from './sync-device.service.js';
import {
  cleanupTestFixture,
  createTestFixture,
  hasTestDatabase,
  type TestFixture,
} from '../../test/db-fixtures.js';

const describeIfDb = hasTestDatabase() ? describe : describe.skip;

describeIfDb('sync ingest integration', () => {
  let fixture: TestFixture;
  let device: { id: string; tenantId: string; deviceId: string };
  const deviceId = 'ingest-test-device';

  beforeAll(async () => {
    fixture = await createTestFixture();
    const { apiKey } = await registerSyncDevice(fixture.tenantId, deviceId);
    device = (await authenticateSyncDevice(apiKey))!;
    if (!device) throw new Error('device not registered');
  });

  afterAll(async () => {
    await cleanupTestFixture(fixture.tenantId);
  });

  it('applies ingested customer profile and writes changelog', async () => {
    const customerId = crypto.randomUUID();
    const outboxId = crypto.randomUUID();

    const results = await ingestRemoteChanges(
      {
        tenantId: fixture.tenantId,
        deviceId,
        entries: [
          {
            outboxId,
            tableName: SYNC_TABLES.customers,
            recordId: customerId,
            operation: 'INSERT',
            recordVersion: 1,
            payload: {
              id: customerId,
              tenant_id: fixture.tenantId,
              name: 'Synced Customer',
              phone: '03001234567',
              balance: '999',
              is_active: true,
              version: 1,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          },
        ],
      },
      device,
    );

    expect(results[0]?.status).toBe('accepted');

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    expect(customer?.name).toBe('Synced Customer');
    expect(customer?.balance.toString()).toBe('0');

    const changelog = await prisma.syncChangelog.findFirst({
      where: { tenantId: fixture.tenantId, recordId: customerId },
    });
    expect(changelog).not.toBeNull();
  });
});
