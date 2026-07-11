import { describe, expect, it } from 'vitest';

import { payloadToRow } from './payload-mapper.js';

describe('payloadToRow', () => {
  it('maps snake_case keys and omits balance for customers', () => {
    const row = payloadToRow(
      {
        id: 'c1',
        tenant_id: 't1',
        name: 'Ali',
        balance: '500',
        created_at: '2026-07-06T12:00:00.000Z',
        sell_price: '99.50',
      },
      { omit: ['balance'] },
    );

    expect(row.name).toBe('Ali');
    expect(row.balance).toBeUndefined();
    expect(row.tenantId).toBe('t1');
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.sellPrice?.toString()).toBe('99.5');
  });
});
