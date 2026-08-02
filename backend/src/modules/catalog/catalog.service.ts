import { z } from 'zod';

import { NotFoundError } from '../core/errors.js';
import { prisma } from '../core/prisma.js';
import { toDecimal } from '../core/money.js';
import { SYNC_TABLES, syncInsert, syncUpdate } from '../sync/sync-payload.js';
import { recordSupplierPurchase, serializeSupplier } from './supplier-ledger.service.js';

export const brandSchema = z.object({
  name: z.string().min(1).max(255),
  isActive: z.boolean().optional(),
});

export const supplierSchema = z.object({
  name: z.string().min(1).max(255),
  phone: z.string().max(20).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function listBrands(tenantId: string, search?: string) {
  const term = search?.trim();
  return prisma.brand.findMany({
    where: {
      tenantId,
      deletedAt: null,
      ...(term ? { name: { contains: term, mode: 'insensitive' } } : {}),
    },
    orderBy: { name: 'asc' },
  });
}

export async function createBrand(tenantId: string, input: z.infer<typeof brandSchema>) {
  return prisma.brand.create({
    data: { tenantId, name: input.name, isActive: input.isActive ?? true },
  });
}

export async function updateBrand(
  tenantId: string,
  id: string,
  input: Partial<z.infer<typeof brandSchema>>,
) {
  const brand = await prisma.brand.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!brand) throw new NotFoundError('Brand not found');
  return prisma.brand.update({
    where: { id },
    data: { name: input.name, isActive: input.isActive },
  });
}

export async function deleteBrand(tenantId: string, id: string) {
  const brand = await prisma.brand.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!brand) throw new NotFoundError('Brand not found');
  await prisma.brand.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  return { success: true };
}

export async function listSuppliers(tenantId: string, search?: string) {
  const term = search?.trim();
  const suppliers = await prisma.supplier.findMany({
    where: {
      tenantId,
      deletedAt: null,
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: 'insensitive' } },
              { phone: { contains: term, mode: 'insensitive' } },
              { email: { contains: term, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ balance: 'desc' }, { name: 'asc' }],
  });
  return suppliers.map(serializeSupplier);
}

export async function createSupplier(tenantId: string, input: z.infer<typeof supplierSchema>) {
  const supplier = await prisma.supplier.create({
    data: {
      tenantId,
      name: input.name,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      notes: input.notes ?? null,
      isActive: input.isActive ?? true,
    },
  });
  return serializeSupplier(supplier);
}

export async function updateSupplier(
  tenantId: string,
  id: string,
  input: Partial<z.infer<typeof supplierSchema>>,
) {
  const supplier = await prisma.supplier.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!supplier) throw new NotFoundError('Supplier not found');
  const updated = await prisma.supplier.update({
    where: { id },
    data: {
      name: input.name,
      phone: input.phone,
      email: input.email,
      address: input.address,
      notes: input.notes,
      isActive: input.isActive,
    },
  });
  return serializeSupplier(updated);
}

export const supplierStockInSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  costPrice: z.number().nonnegative().optional(),
  recordPayable: z.boolean().optional(),
  notes: z.string().optional(),
});

export const supplierPaymentSchema = z.object({
  amount: z.number().positive(),
  paymentMethod: z.string().min(1).max(50).default('cash'),
  notes: z.string().optional(),
});

export async function supplierStockIn(
  tenantId: string,
  supplierId: string,
  input: z.infer<typeof supplierStockInSchema>,
  recordedById: string,
  branchId?: string,
) {
  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, tenantId, deletedAt: null },
  });
  if (!supplier) throw new NotFoundError('Supplier not found');

  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: input.productId, tenantId, deletedAt: null },
    });
    if (!product) throw new NotFoundError('Product not found');

    const delta = toDecimal(input.quantity);
    const newQty = product.stockQuantity.plus(delta);
    const updatedProduct = await tx.product.update({
      where: { id: product.id },
      data: {
        stockQuantity: newQty,
        ...(input.costPrice != null ? { costPrice: toDecimal(input.costPrice) } : {}),
        supplierId,
      },
    });

    const movement = await tx.stockMovement.create({
      data: {
        tenantId,
        productId: product.id,
        movementType: 'STOCK_IN',
        quantityDelta: delta,
        quantityAfter: newQty,
        referenceType: 'supplier_stock_in',
        referenceId: supplierId,
        notes: input.notes ?? `Stock-in from ${supplier.name}`,
        recordedById,
        branchId,
      },
    });

    await syncInsert(tx, SYNC_TABLES.stockMovements, movement);
    await syncUpdate(tx, SYNC_TABLES.products, updatedProduct);

    const cost = input.costPrice ?? (product.costPrice ? Number(product.costPrice) : 0);
    if (input.recordPayable !== false && cost > 0) {
      const payableAmount = toDecimal(cost).times(delta);
      await recordSupplierPurchase(tx, {
        tenantId,
        supplierId,
        amount: payableAmount,
        referenceType: 'stock_in',
        referenceId: movement.id,
        notes: input.notes,
        recordedById,
      });
    }

    return serializeSupplier(await tx.supplier.findUniqueOrThrow({ where: { id: supplierId } }));
  });
}

export async function deleteSupplier(tenantId: string, id: string) {
  const supplier = await prisma.supplier.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!supplier) throw new NotFoundError('Supplier not found');
  await prisma.supplier.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  return { success: true };
}
