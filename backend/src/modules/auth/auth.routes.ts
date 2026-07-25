import type { FastifyInstance } from 'fastify';

import { appConfig } from '../../config.js';
import { ValidationError } from '../core/errors.js';
import {
  changePassword,
  login,
  logout,
  refreshAccessToken,
  registerAuthDecorators,
} from './auth.service.js';
import { changePasswordSchema, loginSchema, refreshSchema } from './auth.schemas.js';
import { authenticate } from '../permissions/permissions.middleware.js';

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  await registerAuthDecorators(app);

  app.post('/auth/login', {
    config: {
      rateLimit:
        appConfig.nodeEnv === 'production'
          ? { max: 5, timeWindow: '15 minutes' }
          : { max: 100, timeWindow: '1 minute' },
    },
    handler: async (request) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid request body', parsed.error.flatten());
      }

      const result = await login(parsed.data.email, parsed.data.password);
      return {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        mustChangePassword: result.mustChangePassword,
        user: {
          id: result.user.id,
          email: result.user.email,
          fullName: result.user.fullName,
          role: result.user.role,
          tenantId: result.user.tenantId,
          features: result.user.features,
          mustChangePassword: result.user.mustChangePassword,
        },
      };
    },
  });

  app.post('/auth/refresh', async (request) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request body', parsed.error.flatten());
    }

    return refreshAccessToken(parsed.data.refreshToken);
  });

  app.post('/auth/logout', async (request) => {
    const body = request.body as { refreshToken?: string };
    const refreshToken = body?.refreshToken;
    if (refreshToken) {
      await logout(refreshToken);
    }
    return { success: true };
  });

  app.post('/auth/change-password', { preHandler: [authenticate] }, async (request) => {
    const parsed = changePasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request body', parsed.error.flatten());
    }

    const result = await changePassword(
      request.user!.id,
      parsed.data.currentPassword,
      parsed.data.newPassword,
    );

    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      mustChangePassword: false,
      user: {
        id: result.user.id,
        email: result.user.email,
        fullName: result.user.fullName,
        role: result.user.role,
        tenantId: result.user.tenantId,
        features: result.user.features,
        mustChangePassword: false,
      },
    };
  });

  app.get('/auth/me', { preHandler: [authenticate] }, async (request) => {
    const jwtUser = request.user!;
    const { prisma } = await import('../core/prisma.js');
    const { resolveUserFeatures } = await import('../permissions/permissions.service.js');
    const { serializeSubscriptionFields } = await import('../tenants/subscription.service.js');
    const { appConfig } = await import('../../config.js');

    // One user row + features (+ tenant for plan) instead of stacked sequential lookups.
    const [dbUser, features, tenant] = await Promise.all([
      prisma.user.findFirst({
        where: { id: jwtUser.id, deletedAt: null, isActive: true },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          tenantId: true,
          mustChangePassword: true,
        },
      }),
      resolveUserFeatures(jwtUser.id, jwtUser.role, jwtUser.tenantId),
      jwtUser.tenantId
        ? prisma.tenant.findFirst({ where: { id: jwtUser.tenantId, deletedAt: null } })
        : Promise.resolve(null),
    ]);

    if (!dbUser) {
      const { UnauthorizedError } = await import('../core/errors.js');
      throw new UnauthorizedError('User not found or inactive');
    }

    const planEntitlement = tenant
      ? {
          ...serializeSubscriptionFields(tenant),
          upgradeUrl: appConfig.upgradeWhatsappUrl,
        }
      : null;

    return {
      id: dbUser.id,
      email: dbUser.email,
      fullName: dbUser.fullName,
      role: dbUser.role,
      tenantId: dbUser.tenantId,
      features,
      mustChangePassword: dbUser.mustChangePassword,
      planEntitlement,
    };
  });
}
