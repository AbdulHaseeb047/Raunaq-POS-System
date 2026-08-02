import type { FastifyInstance } from 'fastify';

import { appConfig } from '../../config.js';
import { UnauthorizedError, ValidationError } from '../core/errors.js';
import {
  changePassword,
  login,
  logout,
  refreshAccessToken,
  registerAuthDecorators,
} from './auth.service.js';
import { changePasswordSchema, loginSchema, refreshSchema } from './auth.schemas.js';
import { authenticate } from '../permissions/permissions.middleware.js';
import { clearAuthCookies, readRefreshToken, setAuthCookies } from './auth-cookies.js';

function publicUser(user: {
  id: string;
  email: string;
  fullName: string;
  role: string;
  tenantId: string | null;
  features: string[];
  mustChangePassword: boolean;
}) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    tenantId: user.tenantId,
    features: user.features,
    mustChangePassword: user.mustChangePassword,
  };
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  await registerAuthDecorators(app);

  app.post('/auth/login', {
    config: {
      rateLimit:
        appConfig.nodeEnv === 'production'
          ? { max: 5, timeWindow: '15 minutes' }
          : { max: 100, timeWindow: '1 minute' },
    },
    handler: async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid request body', parsed.error.flatten());
      }

      const result = await login(parsed.data.email, parsed.data.password);
      setAuthCookies(reply, {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });

      // Tokens stay in httpOnly cookies only — never returned in JSON (privacy).
      return {
        mustChangePassword: result.mustChangePassword,
        user: publicUser(result.user),
      };
    },
  });

  app.post('/auth/refresh', async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw new ValidationError('Invalid request body', parsed.error.flatten());
    }

    const refreshToken = readRefreshToken(request, parsed.data.refreshToken);
    if (!refreshToken) {
      throw new UnauthorizedError('Missing refresh session');
    }

    const result = await refreshAccessToken(refreshToken);
    setAuthCookies(reply, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });

    return { success: true };
  });

  app.post('/auth/logout', async (request, reply) => {
    const body = (request.body ?? {}) as { refreshToken?: string };
    const refreshToken = readRefreshToken(request, body.refreshToken);
    if (refreshToken) {
      await logout(refreshToken);
    }
    clearAuthCookies(reply);
    return { success: true };
  });

  app.post('/auth/change-password', { preHandler: [authenticate] }, async (request, reply) => {
    const parsed = changePasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request body', parsed.error.flatten());
    }

    const result = await changePassword(
      request.user!.id,
      parsed.data.currentPassword,
      parsed.data.newPassword,
    );

    setAuthCookies(reply, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });

    return {
      mustChangePassword: false,
      user: publicUser({ ...result.user, mustChangePassword: false }),
    };
  });

  app.get('/auth/me', { preHandler: [authenticate] }, async (request) => {
    const jwtUser = request.user!;
    const { prisma } = await import('../core/prisma.js');
    const { resolveUserFeatures } = await import('../permissions/permissions.service.js');
    const { serializeSubscriptionFields } = await import('../tenants/subscription.service.js');
    const { appConfig: cfg } = await import('../../config.js');

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
      const { UnauthorizedError: AuthErr } = await import('../core/errors.js');
      throw new AuthErr('User not found or inactive');
    }

    const planEntitlement = tenant
      ? {
          ...serializeSubscriptionFields(tenant),
          upgradeUrl: cfg.upgradeWhatsappUrl,
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
