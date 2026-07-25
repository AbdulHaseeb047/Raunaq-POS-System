import { Decimal } from '@prisma/client/runtime/library';

import { toDecimal } from '../core/money.js';

export interface SaleLineInput {
  unitPrice: number | string | Decimal;
  quantity: number | string | Decimal;
  discountAmount?: number | string | Decimal;
  taxRatePercent?: number | string | Decimal;
}

export interface CalculatedSaleLine {
  lineSubtotal: Decimal;
  discountAmount: Decimal;
  taxAmount: Decimal;
  lineTotal: Decimal;
}

export interface CalculatedSaleTotals {
  subtotal: Decimal;
  discountTotal: Decimal;
  taxTotal: Decimal;
  grandTotal: Decimal;
  lines: CalculatedSaleLine[];
}

export function calculateSaleLine(input: SaleLineInput): CalculatedSaleLine {
  const unitPrice = toDecimal(input.unitPrice);
  const qty = toDecimal(input.quantity);
  const discount = toDecimal(input.discountAmount ?? 0);
  const lineSubtotal = unitPrice.times(qty);
  const taxRate = toDecimal(input.taxRatePercent ?? 0).div(100);
  const taxable = lineSubtotal.minus(discount);
  const taxAmount = taxable.times(taxRate);
  const lineTotal = taxable.plus(taxAmount);

  return { lineSubtotal, discountAmount: discount, taxAmount, lineTotal };
}

export function calculateSaleTotals(
  lines: SaleLineInput[],
  billDiscountAmount?: number | string | Decimal,
): CalculatedSaleTotals {
  const calculatedLines = lines.map(calculateSaleLine);

  const subtotal = calculatedLines.reduce((s, l) => s.plus(l.lineSubtotal), new Decimal(0));
  const lineDiscountTotal = calculatedLines.reduce(
    (s, l) => s.plus(l.discountAmount),
    new Decimal(0),
  );
  const billDiscount = toDecimal(billDiscountAmount ?? 0);
  const discountTotal = lineDiscountTotal.plus(billDiscount);
  const taxTotal = calculatedLines.reduce((s, l) => s.plus(l.taxAmount), new Decimal(0));
  const grandTotal = subtotal.minus(discountTotal).plus(taxTotal);

  return { subtotal, discountTotal, taxTotal, grandTotal, lines: calculatedLines };
}

export function assertDiscountWithinCap(
  totals: Pick<CalculatedSaleTotals, 'subtotal' | 'discountTotal'>,
  maxDiscountPercent: number,
): void {
  if (totals.discountTotal.lte(0)) return;
  const maxAllowed = totals.subtotal.times(maxDiscountPercent).div(100);
  if (totals.discountTotal.gt(maxAllowed)) {
    throw new Error(`DISCOUNT_CAP_EXCEEDED:${maxDiscountPercent}`);
  }
}
