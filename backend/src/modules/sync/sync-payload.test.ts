import { Decimal } from '@prisma/client/runtime/library';
import { describe, expect, it } from 'vitest';

import { serializeRecord } from './sync-payload.js';

describe('serializeRecord', () => {
  it('converts camelCase keys to snake_case and serializes decimals/dates', () => {
    const payload = serializeRecord({
      id: 'abc',
      tenantId: 'tenant-1',
      stockQuantity: new Decimal('12.500'),
      createdAt: new Date('2026-07-06T12:00:00.000Z'),
      balance: new Decimal('100.00'),
    });

    expect(payload).toEqual({
      id: 'abc',
      tenant_id: 'tenant-1',
      stock_quantity: '12.5',
      created_at: '2026-07-06T12:00:00.000Z',
      balance: '100',
    });
  });
});
