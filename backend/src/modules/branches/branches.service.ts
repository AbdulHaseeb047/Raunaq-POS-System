import { z } from 'zod';

import { ConflictError, NotFoundError } from '../core/errors.js';
import { createDefaultBranch } from '../core/branch.js';
import { prisma } from '../core/prisma.js';
import { SYNC_TABLES, syncInsert, syncUpdate } from '../sync/sync-payload.js';

export const branchSchema = z.object({
  name: z.string().min(1).max(255),
  code: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[A-Z0-9_-]+$/i, 'Code must be alphanumeric'),
  address: z.string().optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function listBranches(tenantId: string) {
  const branches = await prisma.branch.findMany({
    where: { tenantId, deletedAt: null },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });

  return branches.map((b) => ({
    id: b.id,
    name: b.name,
    code: b.code,
    address: b.address,
    phone: b.phone,
    isDefault: b.isDefault,
    isActive: b.isActive,
  }));
}

export async function createBranch(tenantId: string, input: z.infer<typeof branchSchema>) {
  const existing = await prisma.branch.findFirst({
    where: { tenantId, code: input.code.toUpperCase(), deletedAt: null },
  });
  if (existing) throw new ConflictError('Branch code already exists');

  const branch = await prisma.$transaction(async (tx) => {
    const created = await tx.branch.create({
      data: {
        tenantId,
        name: input.name,
        code: input.code.toUpperCase(),
        address: input.address ?? null,
        phone: input.phone ?? null,
        isActive: input.isActive ?? true,
      },
    });
    await syncInsert(tx, SYNC_TABLES.branches, { ...created, version: 1 });
    return created;
  });

  return branch;
}

export async function updateBranch(
  tenantId: string,
  branchId: string,
  input: Partial<z.infer<typeof branchSchema>>,
) {
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, tenantId, deletedAt: null },
  });
  if (!branch) throw new NotFoundError('Branch not found');

  return prisma.$transaction(async (tx) => {
    const updated = await tx.branch.update({
      where: { id: branchId },
      data: {
        name: input.name,
        address: input.address,
        phone: input.phone,
        isActive: input.isActive,
      },
    });
    await syncUpdate(tx, SYNC_TABLES.branches, { ...updated, version: 1 });
    return updated;
  });
}

export { createDefaultBranch };
