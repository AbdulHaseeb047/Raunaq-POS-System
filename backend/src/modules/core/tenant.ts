import { USER_ROLES } from '@pos/shared';
import type { FastifyRequest } from 'fastify';

import { ForbiddenError, UnauthorizedError } from './errors.js';

/**
 * For Client Admin / Staff: tenant is always from JWT — URL params are ignored.
 * For Super Admin: tenant comes from the explicit route param.
 */
export function resolveTenantId(request: FastifyRequest, paramTenantId?: string): string {
  if (!request.user) {
    throw new UnauthorizedError();
  }

  if (request.user.role === USER_ROLES.SUPER_ADMIN) {
    if (!paramTenantId) {
      throw new ForbiddenError('Tenant ID required');
    }
    return paramTenantId;
  }

  if (!request.user.tenantId) {
    throw new ForbiddenError('No tenant context — please sign in again');
  }

  return request.user.tenantId;
}
