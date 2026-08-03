import type { Prisma } from '@prisma/client';
import { z } from 'zod';

import { NotFoundError } from '../core/errors.js';
import { prisma } from '../core/prisma.js';
import { toDecimal } from '../core/money.js';
import {
  assertUniqueCompactName,
  compactText,
  findIdsByCompactSearch,
} from '../core/text-match.js';
import { SYNC_TABLES, syncInsert, syncUpdate } from '../sync/sync-payload.js';
import { ensureMiscProduct } from '../billing/misc-product.js';

export const categorySchema = z.object({
  name: z.string().min(1).max(255),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const productSchema = z.object({
  name: z.string().min(1).max(255),
  categoryId: z.string().uuid().optional().nullable(),
  brandId: z.string().uuid().optional().nullable(),
  supplierId: z.string().uuid().optional().nullable(),
  sku: z.string().max(100).optional().nullable(),
  barcode: z.string().max(100).optional().nullable(),
  imageUrl: z.string().max(700_000).optional().nullable(),
  unit: z.string().max(50).optional(),
  costPrice: z.number().nonnegative().optional().nullable(),
  sellPrice: z.number().nonnegative(),
  taxRate: z.number().nonnegative().optional(),
  lowStockThreshold: z.number().nonnegative().optional().nullable(),
  expiryDate: z.string().optional().nullable(),
  trackStock: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const stockAdjustSchema = z.object({
  quantityDelta: z.number(),
  movementType: z.enum(['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT']),
  notes: z.string().optional(),
});

export const importProductRowSchema = z.object({
  name: z.string().min(1).max(255),
  sellPrice: z.number().nonnegative(),
  costPrice: z.number().nonnegative().optional().nullable(),
  sku: z.string().max(100).optional().nullable(),
  barcode: z.string().max(100).optional().nullable(),
  unit: z.string().max(50).optional(),
  categoryName: z.string().max(255).optional().nullable(),
  brandName: z.string().max(255).optional().nullable(),
  supplierName: z.string().max(255).optional().nullable(),
  stockQuantity: z.number().nonnegative().optional(),
  lowStockThreshold: z.number().nonnegative().optional().nullable(),
  trackStock: z.boolean().optional(),
  expiryDate: z.string().optional().nullable(),
});

export const importProductsSchema = z.object({
  rows: z.array(importProductRowSchema).min(1).max(5000),
  updateExisting: z.boolean().optional().default(true),
});

export async function listCategories(tenantId: string, search?: string) {
  const searchIds = await findIdsByCompactSearch('categories', tenantId, search ?? '', [], null);
  if (searchIds && searchIds.length === 0) return [];

  return prisma.category.findMany({
    where: {
      tenantId,
      deletedAt: null,
      ...(searchIds ? { id: { in: searchIds } } : {}),
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

export async function createCategory(tenantId: string, input: z.infer<typeof categorySchema>) {
  const name = input.name.trim();
  await assertUniqueCompactName('categories', tenantId, name, 'category');

  return prisma.$transaction(async (tx) => {
    const category = await tx.category.create({
      data: {
        tenantId,
        name,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
      },
    });
    await syncInsert(tx, SYNC_TABLES.categories, category);
    return category;
  });
}

export async function updateCategory(
  tenantId: string,
  id: string,
  input: Partial<z.infer<typeof categorySchema>>,
) {
  const cat = await prisma.category.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!cat) throw new NotFoundError('Category not found');

  const name = input.name?.trim();
  if (name) {
    await assertUniqueCompactName('categories', tenantId, name, 'category', id);
  }

  return prisma.$transaction(async (tx) => {
    const category = await tx.category.update({
      where: { id },
      data: { name, sortOrder: input.sortOrder, isActive: input.isActive },
    });
    await syncUpdate(tx, SYNC_TABLES.categories, category);
    return category;
  });
}

export async function deleteCategory(tenantId: string, id: string) {
  const cat = await prisma.category.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!cat) throw new NotFoundError('Category not found');
  return prisma.$transaction(async (tx) => {
    const category = await tx.category.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await syncUpdate(tx, SYNC_TABLES.categories, category);
    return { success: true };
  });
}

export async function listProducts(
  tenantId: string,
  options?: {
    search?: string;
    categoryId?: string;
    brandId?: string;
    stockStatus?: 'all' | 'healthy' | 'low' | 'out';
    page?: number;
    pageSize?: number;
    /** Sale register catalog — active items only. */
    activeOnly?: boolean;
    /** Skip COUNT(*) for faster catalog loads. */
    skipCount?: boolean;
    /** Fetch specific product ids (order preserved in response). */
    ids?: string[];
  },
) {
  const page = options?.page ?? 1;
  const pageSize = Math.min(options?.pageSize ?? 50, 5000);
  const skip = (page - 1) * pageSize;
  const idFilter =
    options?.ids && options.ids.length > 0 ? Array.from(new Set(options.ids)).slice(0, 40) : null;

  if (idFilter) {
    const include = {
      category: { select: { id: true, name: true } },
      brand: { select: { id: true, name: true } },
      supplier: { select: { id: true, name: true } },
    } as const;
    const products = await prisma.product.findMany({
      where: {
        tenantId,
        deletedAt: null,
        id: { in: idFilter },
        ...(options?.activeOnly ? { isActive: true } : {}),
      },
      include,
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const ordered = idFilter
      .map((id) => byId.get(id))
      .filter((p): p is (typeof products)[number] => Boolean(p));
    return {
      data: ordered.map(serializeProduct),
      meta: { total: ordered.length, page: 1, pageSize: ordered.length, totalPages: 1 },
    };
  }

  const searchIds = await findIdsByCompactSearch(
    'products',
    tenantId,
    options?.search ?? '',
    ['sku', 'barcode'],
    null,
  );

  if (searchIds && searchIds.length === 0) {
    return {
      data: [],
      meta: { total: 0, page, pageSize, totalPages: 0 },
    };
  }

  const where: Prisma.ProductWhereInput = {
    tenantId,
    deletedAt: null,
    ...(options?.activeOnly ? { isActive: true } : {}),
    ...(options?.categoryId ? { categoryId: options.categoryId } : {}),
    ...(options?.brandId ? { brandId: options.brandId } : {}),
    ...(searchIds ? { id: { in: searchIds } } : {}),
    ...(options?.stockStatus === 'out' ? { trackStock: true, stockQuantity: { lte: 0 } } : {}),
  };

  const include = {
    category: { select: { id: true, name: true } },
    brand: { select: { id: true, name: true } },
    supplier: { select: { id: true, name: true } },
  } as const;

  // low/healthy compare two columns — filter after a DB-scoped fetch
  if (options?.stockStatus === 'low' || options?.stockStatus === 'healthy') {
    const products = await prisma.product.findMany({
      where,
      include,
      orderBy: { name: 'asc' },
    });
    const filtered = products.filter((p) => {
      if (!p.trackStock) return options.stockStatus === 'healthy';
      const qty = Number(p.stockQuantity);
      const threshold = p.lowStockThreshold ? Number(p.lowStockThreshold) : 0;
      if (options.stockStatus === 'low') return qty > 0 && threshold > 0 && qty <= threshold;
      return qty > threshold || threshold === 0;
    });
    const total = filtered.length;
    const data = filtered.slice(skip, skip + pageSize).map(serializeProduct);
    return {
      data,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  const products = await prisma.product.findMany({
    where,
    include,
    orderBy: { name: 'asc' },
    skip,
    take: pageSize,
  });
  const total = options?.skipCount ? products.length + skip : await prisma.product.count({ where });

  return {
    data: products.map(serializeProduct),
    meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 1 },
  };
}

export async function getInventorySummary(tenantId: string) {
  // Only columns needed for aggregates — avoid loading full product rows over Railway↔DB.
  const products = await prisma.product.findMany({
    where: { tenantId, deletedAt: null, isActive: true },
    select: {
      costPrice: true,
      sellPrice: true,
      stockQuantity: true,
      trackStock: true,
      lowStockThreshold: true,
    },
  });

  let totalValue = 0;
  let projectedProfit = 0;
  let healthy = 0;
  let low = 0;
  let out = 0;

  for (const p of products) {
    const cost = p.costPrice ? Number(p.costPrice) : 0;
    const sell = Number(p.sellPrice);
    const qty = Number(p.stockQuantity);
    totalValue += cost * qty;
    projectedProfit += (sell - cost) * qty;

    if (!p.trackStock) {
      healthy++;
      continue;
    }
    const threshold = p.lowStockThreshold ? Number(p.lowStockThreshold) : 0;
    if (qty <= 0) out++;
    else if (threshold > 0 && qty <= threshold) low++;
    else healthy++;
  }

  return {
    totalProducts: products.length,
    healthyCount: healthy,
    lowStockCount: low,
    outOfStockCount: out,
    inventoryValue: totalValue.toFixed(2),
    projectedProfit: projectedProfit.toFixed(2),
  };
}

export async function getProductByBarcode(tenantId: string, barcode: string) {
  const product = await prisma.product.findFirst({
    where: { tenantId, barcode, deletedAt: null, isActive: true },
    include: {
      category: { select: { id: true, name: true } },
      brand: { select: { id: true, name: true } },
      supplier: { select: { id: true, name: true } },
    },
  });
  if (!product) throw new NotFoundError('Product not found');
  return serializeProduct(product);
}

export async function createProduct(tenantId: string, input: z.infer<typeof productSchema>) {
  const name = input.name.trim();
  await assertUniqueCompactName('products', tenantId, name, 'product');

  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        tenantId,
        name,
        categoryId: input.categoryId ?? null,
        brandId: input.brandId ?? null,
        supplierId: input.supplierId ?? null,
        sku: input.sku ?? null,
        barcode: input.barcode ?? null,
        imageUrl: input.imageUrl ?? null,
        unit: input.unit ?? 'piece',
        costPrice: input.costPrice != null ? toDecimal(input.costPrice) : null,
        sellPrice: toDecimal(input.sellPrice),
        taxRate: toDecimal(input.taxRate ?? 0),
        lowStockThreshold:
          input.lowStockThreshold != null ? toDecimal(input.lowStockThreshold) : null,
        expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
        trackStock: input.trackStock ?? true,
        isActive: input.isActive ?? true,
      },
      include: {
        category: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
      },
    });
    await syncInsert(tx, SYNC_TABLES.products, created);
    return created;
  });
  return serializeProduct(product);
}

export async function updateProduct(
  tenantId: string,
  id: string,
  input: Partial<z.infer<typeof productSchema>>,
) {
  const existing = await prisma.product.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!existing) throw new NotFoundError('Product not found');

  const name = input.name?.trim();
  if (name) {
    await assertUniqueCompactName('products', tenantId, name, 'product', id);
  }

  const product = await prisma.$transaction(async (tx) => {
    const updated = await tx.product.update({
      where: { id },
      data: {
        name,
        categoryId: input.categoryId,
        brandId: input.brandId,
        supplierId: input.supplierId,
        sku: input.sku,
        barcode: input.barcode,
        imageUrl: input.imageUrl,
        unit: input.unit,
        costPrice: input.costPrice != null ? toDecimal(input.costPrice) : undefined,
        sellPrice: input.sellPrice != null ? toDecimal(input.sellPrice) : undefined,
        taxRate: input.taxRate != null ? toDecimal(input.taxRate) : undefined,
        lowStockThreshold:
          input.lowStockThreshold != null ? toDecimal(input.lowStockThreshold) : undefined,
        expiryDate:
          input.expiryDate !== undefined
            ? input.expiryDate
              ? new Date(input.expiryDate)
              : null
            : undefined,
        trackStock: input.trackStock,
        isActive: input.isActive,
      },
      include: {
        category: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
      },
    });
    await syncUpdate(tx, SYNC_TABLES.products, updated);
    return updated;
  });
  return serializeProduct(product);
}

export async function adjustStock(
  tenantId: string,
  productId: string,
  input: z.infer<typeof stockAdjustSchema>,
  recordedById: string,
) {
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: productId, tenantId, deletedAt: null },
    });
    if (!product) throw new NotFoundError('Product not found');

    const delta = toDecimal(input.quantityDelta);
    const newQty = product.stockQuantity.plus(delta);
    if (newQty.lt(0)) throw new NotFoundError('Stock cannot go negative');

    const updatedProduct = await tx.product.update({
      where: { id: productId },
      data: { stockQuantity: newQty },
    });

    const movement = await tx.stockMovement.create({
      data: {
        tenantId,
        productId,
        movementType: input.movementType,
        quantityDelta: delta,
        quantityAfter: newQty,
        referenceType: 'manual',
        notes: input.notes,
        recordedById,
      },
    });

    await syncUpdate(tx, SYNC_TABLES.products, updatedProduct);
    await syncInsert(tx, SYNC_TABLES.stockMovements, movement);

    return { productId, stockQuantity: newQty.toFixed(3) };
  });
}

export async function deleteProduct(tenantId: string, id: string) {
  const existing = await prisma.product.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!existing) throw new NotFoundError('Product not found');
  return prisma.$transaction(async (tx) => {
    const updated = await tx.product.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await syncUpdate(tx, SYNC_TABLES.products, updated);
    return { success: true };
  });
}

export async function getMiscOpenProduct(tenantId: string) {
  const product = await ensureMiscProduct(tenantId);
  return serializeProduct(product);
}

function serializeProduct(p: {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  imageUrl: string | null;
  unit: string;
  costPrice?: { toFixed: (n: number) => string } | null;
  sellPrice: { toFixed: (n: number) => string };
  stockQuantity: { toFixed: (n: number) => string };
  lowStockThreshold: { toFixed: (n: number) => string } | null;
  taxRate: { toFixed: (n: number) => string };
  expiryDate?: Date | null;
  trackStock: boolean;
  isActive: boolean;
  category: { id: string; name: string } | null;
  brand?: { id: string; name: string } | null;
  supplier?: { id: string; name: string } | null;
}) {
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    barcode: p.barcode,
    imageUrl: p.imageUrl,
    unit: p.unit,
    costPrice: p.costPrice?.toFixed(2) ?? null,
    sellPrice: p.sellPrice.toFixed(2),
    stockQuantity: p.stockQuantity.toFixed(3),
    lowStockThreshold: p.lowStockThreshold?.toFixed(3) ?? null,
    taxRate: p.taxRate.toFixed(2),
    expiryDate: p.expiryDate?.toISOString().slice(0, 10) ?? null,
    trackStock: p.trackStock,
    isActive: p.isActive,
    category: p.category,
    brand: p.brand ?? null,
    supplier: p.supplier ?? null,
  };
}

function buildNameIdMap(items: Array<{ id: string; name: string }>): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of items) {
    map.set(compactText(item.name), item.id);
  }
  return map;
}

export async function importProducts(
  tenantId: string,
  input: z.infer<typeof importProductsSchema>,
) {
  const [categories, brands, suppliers, existingProducts] = await Promise.all([
    prisma.category.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, name: true },
    }),
    prisma.brand.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, name: true },
    }),
    prisma.supplier.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, name: true },
    }),
    prisma.product.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, sku: true, barcode: true },
    }),
  ]);

  const categoryByName = buildNameIdMap(categories);
  const brandByName = buildNameIdMap(brands);
  const supplierByName = buildNameIdMap(suppliers);
  const byBarcode = new Map<string, string>();
  const bySku = new Map<string, string>();
  for (const p of existingProducts) {
    if (p.barcode) byBarcode.set(p.barcode.trim().toLowerCase(), p.id);
    if (p.sku) bySku.set(p.sku.trim().toLowerCase(), p.id);
  }

  const resolveName = (map: Map<string, string>, name: string | null | undefined) => {
    if (!name?.trim()) return null;
    return map.get(compactText(name)) ?? null;
  };

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: Array<{ row: number; message: string }> = [];
  const maxErrors = 50;

  for (let i = 0; i < input.rows.length; i++) {
    const row = input.rows[i]!;
    try {
      const categoryId = resolveName(categoryByName, row.categoryName);
      const brandId = resolveName(brandByName, row.brandName);
      const supplierId = resolveName(supplierByName, row.supplierName);

      const barcodeKey = row.barcode?.trim().toLowerCase();
      const skuKey = row.sku?.trim().toLowerCase();
      const existingId =
        (barcodeKey ? byBarcode.get(barcodeKey) : undefined) ??
        (skuKey ? bySku.get(skuKey) : undefined);

      if (existingId) {
        if (!input.updateExisting) {
          skipped++;
          continue;
        }
        await updateProduct(tenantId, existingId, {
          name: row.name,
          sellPrice: row.sellPrice,
          costPrice: row.costPrice ?? null,
          sku: row.sku ?? null,
          barcode: row.barcode ?? null,
          unit: row.unit ?? 'pcs',
          categoryId,
          brandId,
          supplierId,
          lowStockThreshold: row.lowStockThreshold ?? null,
          trackStock: row.trackStock ?? true,
          expiryDate: row.expiryDate ?? null,
        });
        if (row.stockQuantity != null) {
          await prisma.product.update({
            where: { id: existingId },
            data: { stockQuantity: toDecimal(row.stockQuantity) },
          });
        }
        // Keep lookup maps current if sku/barcode changed.
        if (barcodeKey) byBarcode.set(barcodeKey, existingId);
        if (skuKey) bySku.set(skuKey, existingId);
        updated++;
        continue;
      }

      const createdProduct = await createProduct(tenantId, {
        name: row.name,
        sellPrice: row.sellPrice,
        costPrice: row.costPrice ?? null,
        sku: row.sku ?? null,
        barcode: row.barcode ?? null,
        unit: row.unit ?? 'pcs',
        categoryId,
        brandId,
        supplierId,
        lowStockThreshold: row.lowStockThreshold ?? null,
        trackStock: row.trackStock ?? true,
        expiryDate: row.expiryDate ?? null,
      });

      if (row.stockQuantity != null && row.stockQuantity > 0) {
        await prisma.product.update({
          where: { id: createdProduct.id },
          data: { stockQuantity: toDecimal(row.stockQuantity) },
        });
      }
      if (barcodeKey) byBarcode.set(barcodeKey, createdProduct.id);
      if (skuKey) bySku.set(skuKey, createdProduct.id);
      created++;
    } catch (err) {
      if (errors.length < maxErrors) {
        errors.push({
          row: i + 1,
          message: err instanceof Error ? err.message : 'Import failed',
        });
      }
    }
  }

  return { created, updated, skipped, errors, total: input.rows.length };
}

export async function purgeAllProducts(tenantId: string) {
  const products = await prisma.product.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true },
  });

  if (products.length === 0) {
    return { deleted: 0 };
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    for (const product of products) {
      const updated = await tx.product.update({
        where: { id: product.id },
        data: { deletedAt: now, isActive: false },
      });
      await syncUpdate(tx, SYNC_TABLES.products, updated);
    }
  });

  return { deleted: products.length };
}
