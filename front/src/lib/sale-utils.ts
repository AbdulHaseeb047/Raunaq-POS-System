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

/**
 * Lower = better. Prefix matches beat “contains” matches
 * (typing "s" → Sugar before Basmati).
 */
export function productSearchRank(product: Product, keyword: string): number {
  const q = keyword.trim().toLowerCase();
  if (!q) return 0;

  const name = product.name.toLowerCase();
  const sku = product.sku?.toLowerCase() ?? '';
  const barcode = product.barcode?.toLowerCase() ?? '';

  if (name.startsWith(q)) return 0;
  if (sku.startsWith(q) || barcode.startsWith(q)) return 1;
  if (name.split(/[\s\-_/]+/).some((word) => word.startsWith(q))) return 2;
  if (name.includes(q) || sku.includes(q) || barcode.includes(q)) return 3;
  return 99;
}

/** Filter by keyword, then rank: starts-with first, then contains. */
export function filterAndRankProducts(products: Product[], keyword: string): Product[] {
  const q = keyword.trim();
  if (!q) return products;

  return products
    .filter((p) => productMatchesKeyword(p, q))
    .sort((a, b) => {
      const rankDiff = productSearchRank(a, q) - productSearchRank(b, q);
      if (rankDiff !== 0) return rankDiff;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
}
