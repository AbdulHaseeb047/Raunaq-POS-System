import { prisma } from '../core/prisma.js';

export const MISC_PRODUCT_SKU = '__MISC_OPEN__';
export const MISC_CATEGORY_NAME = 'Other';
export const MISC_PRODUCT_NAME = 'Miscellaneous sale';

/** Ensures an "Other" category + open-amount product exist (no stock tracking). */
export async function ensureMiscProduct(tenantId: string) {
  let category = await prisma.category.findFirst({
    where: { tenantId, name: MISC_CATEGORY_NAME, deletedAt: null },
  });
  if (!category) {
    category = await prisma.category.create({
      data: {
        tenantId,
        name: MISC_CATEGORY_NAME,
        sortOrder: 999,
      },
    });
  }

  let product = await prisma.product.findFirst({
    where: { tenantId, sku: MISC_PRODUCT_SKU, deletedAt: null },
    include: {
      category: { select: { id: true, name: true } },
      brand: { select: { id: true, name: true } },
      supplier: { select: { id: true, name: true } },
    },
  });

  if (!product) {
    product = await prisma.product.create({
      data: {
        tenantId,
        categoryId: category.id,
        name: MISC_PRODUCT_NAME,
        sku: MISC_PRODUCT_SKU,
        sellPrice: 0,
        costPrice: 0,
        stockQuantity: 0,
        trackStock: false,
        isActive: true,
        unit: 'pcs',
      },
      include: {
        category: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
      },
    });
  } else if (!product.isActive || product.trackStock || product.categoryId !== category.id) {
    product = await prisma.product.update({
      where: { id: product.id },
      data: {
        isActive: true,
        trackStock: false,
        categoryId: category.id,
        name: product.name || MISC_PRODUCT_NAME,
      },
      include: {
        category: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
      },
    });
  }

  return product;
}
