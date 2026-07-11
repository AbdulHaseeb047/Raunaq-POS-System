import { Decimal } from '@prisma/client/runtime/library';
import { describe, expect, it } from 'vitest';

/**
 * FIFO allocation logic mirrored from ledger.service for unit testing
 * without a database connection.
 */
function allocateFifo(
  paymentAmount: number,
  obligations: Array<{ id: string; remaining: number; createdAt: number }>,
) {
  const sorted = [...obligations].sort((a, b) => a.createdAt - b.createdAt);
  let remaining = new Decimal(paymentAmount);
  const allocations: Array<{ obligationId: string; amount: string }> = [];

  for (const ob of sorted) {
    if (remaining.lte(0)) break;
    const apply = Decimal.min(remaining, new Decimal(ob.remaining));
    allocations.push({ obligationId: ob.id, amount: apply.toFixed(2) });
    remaining = remaining.minus(apply);
  }

  return { allocations, unallocated: remaining.toFixed(2) };
}

describe('udhaar FIFO payment allocation', () => {
  it('applies payment to oldest obligation first', () => {
    const result = allocateFifo(150, [
      { id: 'a', remaining: 100, createdAt: 1 },
      { id: 'b', remaining: 200, createdAt: 2 },
    ]);

    expect(result.allocations).toEqual([
      { obligationId: 'a', amount: '100.00' },
      { obligationId: 'b', amount: '50.00' },
    ]);
    expect(result.unallocated).toBe('0.00');
  });

  it('leaves unallocated amount when payment exceeds open obligations', () => {
    const result = allocateFifo(500, [{ id: 'a', remaining: 100, createdAt: 1 }]);
    expect(result.allocations).toEqual([{ obligationId: 'a', amount: '100.00' }]);
    expect(result.unallocated).toBe('400.00');
  });
});
