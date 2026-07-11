import type { Prisma } from '@prisma/client';
import { z } from 'zod';

import { NotFoundError } from '../core/errors.js';
import { prisma } from '../core/prisma.js';

export const heldCartSchema = z.object({
  name: z.string().max(255).optional(),
  cartData: z.record(z.unknown()),
});

export async function listHeldCarts(tenantId: string, cashierId: string) {
  return prisma.heldCart.findMany({
    where: { tenantId, cashierId },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function saveHeldCart(
  tenantId: string,
  cashierId: string,
  input: z.infer<typeof heldCartSchema>,
  branchId?: string,
) {
  return prisma.heldCart.create({
    data: {
      tenantId,
      cashierId,
      branchId,
      name: input.name,
      cartData: input.cartData as Prisma.InputJsonValue,
    },
  });
}

export async function deleteHeldCart(tenantId: string, id: string, cashierId: string) {
  const cart = await prisma.heldCart.findFirst({ where: { id, tenantId, cashierId } });
  if (!cart) throw new NotFoundError('Held cart not found');
  await prisma.heldCart.delete({ where: { id } });
  return { success: true };
}
