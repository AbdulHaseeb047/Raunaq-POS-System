import type { Product } from '@/types/api';

export interface CartLineInput {
  product: Product;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
}

export interface SaleTotals {
  subtotal: number;
  lineDiscount: number;
  billDiscount: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
}

export function calcLineTax(
  unitPrice: number,
  quantity: number,
  discountAmount: number,
  taxRatePercent: number,
): number {
  const taxable = unitPrice * quantity - discountAmount;
  return taxable * (taxRatePercent / 100);
}

export function calcSaleTotals(
  lines: CartLineInput[],
  billDiscount: number,
  defaultTaxRate = 0,
): SaleTotals {
  let subtotal = 0;
  let lineDiscount = 0;
  let taxTotal = 0;

  for (const line of lines) {
    subtotal += line.unitPrice * line.quantity;
    lineDiscount += line.discountAmount;
    const taxRate = parseFloat(line.product.taxRate) || defaultTaxRate;
    taxTotal += calcLineTax(line.unitPrice, line.quantity, line.discountAmount, taxRate);
  }

  const discountTotal = lineDiscount + billDiscount;
  const grandTotal = Math.max(0, subtotal - discountTotal + taxTotal);

  return { subtotal, lineDiscount, billDiscount, discountTotal, taxTotal, grandTotal };
}

export function getStockStatus(product: Product): 'healthy' | 'low' | 'out' | 'untracked' {
  if (!product.trackStock) return 'untracked';
  const qty = parseFloat(product.stockQuantity);
  const threshold = product.lowStockThreshold ? parseFloat(product.lowStockThreshold) : 0;
  if (qty <= 0) return 'out';
  if (threshold > 0 && qty <= threshold) return 'low';
  return 'healthy';
}

export function canAddToCart(product: Product, addQty = 1, currentQty = 0): boolean {
  if (!product.trackStock) return true;
  return parseFloat(product.stockQuantity) >= currentQty + addQty;
}

/** Instant client-side filter for name / SKU / barcode. */
export function productMatchesKeyword(product: Product, keyword: string): boolean {
  const q = keyword.trim().toLowerCase();
  if (!q) return true;
  return (
    product.name.toLowerCase().includes(q) ||
    (product.sku?.toLowerCase().includes(q) ?? false) ||
    (product.barcode?.toLowerCase().includes(q) ?? false)
  );
}
