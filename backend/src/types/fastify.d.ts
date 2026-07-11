import type { FeatureKey, UserRole } from '@pos/shared';

import type { AuthenticatedSyncDevice } from '../modules/sync/sync-device.service.js';

export interface AuthenticatedUser {
  id: string;
  tenantId: string | null;
  email: string;
  fullName: string;
  role: UserRole;
  features: FeatureKey[];
  mustChangePassword: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
    syncDevice?: AuthenticatedSyncDevice;
  }
}
