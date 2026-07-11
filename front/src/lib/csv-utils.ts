export function escapeCsvCell(value: unknown): string {
  const str = value == null ? '' : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

export function downloadCsv(filename: string, rows: string[][]): void {
  const csv = rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (char === '\n' || (char === '\r' && next === '\n')) {
      row.push(cell.trim());
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      cell = '';
      if (char === '\r') i++;
    } else if (char !== '\r') {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    if (row.some((c) => c.length > 0)) rows.push(row);
  }

  return rows;
}

export const INVENTORY_CSV_HEADERS = [
  'name',
  'sku',
  'barcode',
  'sell_price',
  'cost_price',
  'unit',
  'category',
  'brand',
  'supplier',
  'stock_quantity',
  'low_stock_threshold',
  'track_stock',
  'expiry_date',
] as const;

function parseBool(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'y';
}

function parseNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = parseFloat(trimmed);
  return Number.isFinite(n) ? n : null;
}

export interface InventoryCsvRow {
  name: string;
  sellPrice: number;
  costPrice?: number | null;
  sku?: string | null;
  barcode?: string | null;
  unit?: string;
  categoryName?: string | null;
  brandName?: string | null;
  supplierName?: string | null;
  stockQuantity?: number;
  lowStockThreshold?: number | null;
  trackStock?: boolean;
  expiryDate?: string | null;
}

export function csvRowsToImportProducts(rows: string[][]): {
  products: InventoryCsvRow[];
  errors: string[];
} {
  if (rows.length === 0) return { products: [], errors: ['CSV file is empty'] };

  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const dataRows = rows.slice(1);
  const errors: string[] = [];
  const products: InventoryCsvRow[] = [];

  const col = (name: string, cells: string[]) => {
    const idx = header.indexOf(name);
    return idx >= 0 ? (cells[idx] ?? '').trim() : '';
  };

  for (let i = 0; i < dataRows.length; i++) {
    const cells = dataRows[i]!;
    if (cells.every((c) => !c.trim())) continue;

    const name = col('name', cells);
    const sellPrice = parseNumber(col('sell_price', cells));

    if (!name) {
      errors.push(`Row ${i + 2}: name is required`);
      continue;
    }
    if (sellPrice == null || sellPrice < 0) {
      errors.push(`Row ${i + 2}: valid sell_price is required`);
      continue;
    }

    const stockQty = parseNumber(col('stock_quantity', cells));
    const lowStock = parseNumber(col('low_stock_threshold', cells));
    const trackStockRaw = col('track_stock', cells);

    products.push({
      name,
      sellPrice,
      costPrice: parseNumber(col('cost_price', cells)),
      sku: col('sku', cells) || null,
      barcode: col('barcode', cells) || null,
      unit: col('unit', cells) || 'pcs',
      categoryName: col('category', cells) || null,
      brandName: col('brand', cells) || null,
      supplierName: col('supplier', cells) || null,
      stockQuantity: stockQty ?? undefined,
      lowStockThreshold: lowStock,
      trackStock: trackStockRaw ? parseBool(trackStockRaw) : true,
      expiryDate: col('expiry_date', cells) || null,
    });
  }

  return { products, errors };
}

export function productToCsvRow(p: {
  name: string;
  sku: string | null;
  barcode: string | null;
  sellPrice: string;
  costPrice: string | null;
  unit: string;
  category?: { name: string } | null;
  brand?: { name: string } | null;
  supplier?: { name: string } | null;
  stockQuantity: string;
  lowStockThreshold: string | null;
  trackStock: boolean;
  expiryDate: string | null;
}): string[] {
  return [
    p.name,
    p.sku ?? '',
    p.barcode ?? '',
    p.sellPrice,
    p.costPrice ?? '',
    p.unit,
    p.category?.name ?? '',
    p.brand?.name ?? '',
    p.supplier?.name ?? '',
    p.stockQuantity,
    p.lowStockThreshold ?? '',
    p.trackStock ? 'true' : 'false',
    p.expiryDate ?? '',
  ];
}
