import { z } from 'zod';

import { prisma } from '../core/prisma.js';

export const createSupportQuerySchema = z.object({
  topic: z.enum(['billing', 'technical', 'feature', 'account', 'other']),
  subject: z.string().trim().min(3).max(200),
  message: z.string().trim().min(10).max(4000),
});

export type CreateSupportQueryInput = z.infer<typeof createSupportQuerySchema>;

export async function createSupportQuery(
  tenantId: string,
  userId: string,
  input: CreateSupportQueryInput,
) {
  const row = await prisma.supportQuery.create({
    data: {
      tenantId,
      userId,
      topic: input.topic,
      subject: input.subject,
      message: input.message,
    },
    select: {
      id: true,
      topic: true,
      subject: true,
      status: true,
      createdAt: true,
    },
  });

  return row;
}
