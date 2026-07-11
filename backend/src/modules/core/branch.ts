import type { FastifyRequest } from 'fastify';
import { USER_ROLES } from '@pos/shared';

import { ForbiddenError, NotFoundError, UnauthorizedError } from './errors.js';
import { prisma } from './prisma.js';

async function getDefaultBranchId(tenantId: string): Promise<string> {
  const defaultBranch = await prisma.branch.findFirst({
    where: { tenantId, isDefault: true, deletedAt: null, isActive: true },
  });

  if (!defaultBranch) {
    throw new ForbiddenError('No default branch configured for tenant');
  }

  return defaultBranch.id;
}

/**
 * Ensures staff users operate only at their assigned branch (or the tenant default if unset).
 * Client admins may use any active branch in the tenant.
 */
async function assertStaffBranchAccess(
  userId: string,
  tenantId: string,
  resolvedBranchId: string,
): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId, deletedAt: null, isActive: true },
    select: { role: true, branchId: true },
  });

  if (!user || user.role !== USER_ROLES.STAFF) return;

  const allowedBranchId = user.branchId ?? (await getDefaultBranchId(tenantId));
  if (resolvedBranchId !== allowedBranchId) {
    throw new ForbiddenError('Staff may only operate at their assigned branch');
  }
}

/**
 * Resolves branch for tenant-scoped operations.
 * Priority: X-Branch-Id header → tenant default branch.
 * Header value is validated against the tenant; staff are restricted to their assigned branch.
 */
export async function resolveBranchId(request: FastifyRequest, tenantId: string): Promise<string> {
  if (!request.user) {
    throw new UnauthorizedError();
  }

  let resolvedBranchId: string;

  const headerBranch = request.headers['x-branch-id'];
  if (typeof headerBranch === 'string' && headerBranch.length > 0) {
    const branch = await prisma.branch.findFirst({
      where: { id: headerBranch, tenantId, deletedAt: null, isActive: true },
    });
    if (!branch) {
      throw new NotFoundError('Branch not found');
    }
    resolvedBranchId = branch.id;
  } else {
    resolvedBranchId = await getDefaultBranchId(tenantId);
  }

  await assertStaffBranchAccess(request.user.id, tenantId, resolvedBranchId);
  return resolvedBranchId;
}

export async function createDefaultBranch(tenantId: string, name: string): Promise<string> {
  const branch = await prisma.branch.create({
    data: {
      tenantId,
      name: `${name} — Main`,
      code: 'MAIN',
      isDefault: true,
      isActive: true,
    },
  });
  return branch.id;
}
