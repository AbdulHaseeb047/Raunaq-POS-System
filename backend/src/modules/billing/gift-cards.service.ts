import { z } from 'zod';

import { NotFoundError, ValidationError } from '../core/errors.js';
import { prisma } from '../core/prisma.js';
import { toDecimal } from '../core/money.js';

export const giftCardSchema = z.object({
  code: z.string().min(4).max(50),
  initialBalance: z.number().positive(),
  expiresAt: z.string().optional().nullable(),
});

export async function listGiftCards(tenantId: string) {
  const cards = await prisma.giftCard.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
  });
  return cards.map((c) => ({
    ...c,
    initialBalance: c.initialBalance.toFixed(2),
    balance: c.balance.toFixed(2),
    expiresAt: c.expiresAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));
}

export async function createGiftCard(tenantId: string, input: z.infer<typeof giftCardSchema>) {
  const existing = await prisma.giftCard.findFirst({
    where: { tenantId, code: input.code.toUpperCase() },
  });
  if (existing) throw new ValidationError('Gift card code already exists');

  const card = await prisma.giftCard.create({
    data: {
      tenantId,
      code: input.code.toUpperCase(),
      initialBalance: toDecimal(input.initialBalance),
      balance: toDecimal(input.initialBalance),
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    },
  });
  return {
    ...card,
    initialBalance: card.initialBalance.toFixed(2),
    balance: card.balance.toFixed(2),
  };
}

export async function lookupGiftCard(tenantId: string, code: string) {
  const card = await prisma.giftCard.findFirst({
    where: { tenantId, code: code.toUpperCase(), isActive: true },
  });
  if (!card) throw new NotFoundError('Gift card not found');
  if (card.expiresAt && card.expiresAt < new Date()) {
    throw new ValidationError('Gift card has expired');
  }
  return {
    id: card.id,
    code: card.code,
    balance: card.balance.toFixed(2),
    isActive: card.isActive,
  };
}
