import { describe, expect, it } from 'vitest';

import { calculateSaleTotals } from './billing.totals.js';

describe('calculateSaleTotals', () => {
  it('computes subtotal, tax, and grand total for multiple lines', () => {
    const result = calculateSaleTotals(
      [
        { unitPrice: 100, quantity: 2, taxRatePercent: 10 },
        { unitPrice: 50, quantity: 1, discountAmount: 5, taxRatePercent: 0 },
      ],
      10,
    );

    expect(result.subtotal.toFixed(2)).toBe('250.00');
    expect(result.discountTotal.toFixed(2)).toBe('15.00');
    expect(result.taxTotal.toFixed(2)).toBe('20.00');
    expect(result.grandTotal.toFixed(2)).toBe('255.00');
  });

  it('applies line discounts toward discount cap base', () => {
    const result = calculateSaleTotals([{ unitPrice: 100, quantity: 1, discountAmount: 20 }], 0);
    expect(result.discountTotal.toFixed(2)).toBe('20.00');
    expect(result.subtotal.toFixed(2)).toBe('100.00');
  });
});
