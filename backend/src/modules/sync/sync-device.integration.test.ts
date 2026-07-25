import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ForbiddenError } from '../core/errors.js';
import { prisma } from '../core/prisma.js';
import { ingestRemoteChanges } from './ingest.service.js';
import { retryOutboxEntry } from './outbox-issues.service.js';
import { SYNC_TABLES } from './sync-payload.js';
import {
  assertSyncDeviceBinding,
  authenticateSyncDevice,
  registerSyncDevice,
} from './sync-device.service.js';
import {
  cleanupTestFixture,
  createTestFixture,
  hasTestDatabase,
  type TestFixture,
} from '../../test/db-fixtures.js';

const describeIfDb = hasTestDatabase() ? describe : describe.skip;

describeIfDb('sync device auth integration', () => {
  let fixture: TestFixture;
  let apiKey: string;
  const deviceId = 'test-register-a';

  beforeAll(async () => {
    fixture = await createTestFixture();
    const registered = await registerSyncDevice(fixture.tenantId, deviceId, 'Test lane');
    apiKey = registered.apiKey;
  });

  afterAll(async () => {
    await cleanupTestFixture(fixture.tenantId);
  });

  it('authenticates a registered per-device API key', async () => {
    const device = await authenticateSyncDevice(apiKey);
    expect(device?.tenantId).toBe(fixture.tenantId);
    expect(device?.deviceId).toBe(deviceId);
  });

  it('rejects ingest when tenantId does not match the device', async () => {
    const device = (await authenticateSyncDevice(apiKey))!;
    const otherTenant = crypto.randomUUID();

    await expect(
      ingestRemoteChanges(
        {
          tenantId: otherTenant,
          deviceId,
          entries: [
            {
              outboxId: crypto.randomUUID(),
              tableName: SYNC_TABLES.customers,
              recordId: crypto.randomUUID(),
              operation: 'INSERT',
              recordVersion: 1,
              payload: { id: crypto.randomUUID(), tenant_id: otherTenant, name: 'Bad' },
            },
          ],
        },
        device,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('requeues CONFLICT rows via retry endpoint for next push cycle', async () => {
    const outboxId = crypto.randomUUID();
    await prisma.syncOutbox.create({
      data: {
        id: outboxId,
        tenantId: fixture.tenantId,
        tableName: SYNC_TABLES.sales,
        recordId: crypto.randomUUID(),
        operation: 'INSERT',
        payload: {},
        recordVersion: 1,
        status: 'CONFLICT',
        errorMessage: 'version conflict',
      },
    });

    const result = await retryOutboxEntry(fixture.tenantId, outboxId);
    expect(result.status).toBe('PENDING');

    const row = await prisma.syncOutbox.findUnique({ where: { id: outboxId } });
    expect(row?.status).toBe('PENDING');
    expect(row?.errorMessage).toBeNull();
  });

  it('binds tenant and device ids strictly', () => {
    const device = { id: '1', tenantId: fixture.tenantId, deviceId };
    expect(() => assertSyncDeviceBinding(device, fixture.tenantId, deviceId)).not.toThrow();
    expect(() => assertSyncDeviceBinding(device, fixture.tenantId, 'other-device')).toThrow(
      ForbiddenError,
    );
  });
});
