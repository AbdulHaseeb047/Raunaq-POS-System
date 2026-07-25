import type { FastifyInstance } from 'fastify';
import { FEATURES } from '@pos/shared';

import { ValidationError } from '../core/errors.js';
import { resolveTenantId } from '../core/tenant.js';
import { resolveBranchId } from '../core/branch.js';
import { authenticate, requireFeature } from '../permissions/permissions.middleware.js';
import { getSettings } from '../settings/settings.service.js';
import {
  createSale,
  createSaleSchema,
  getSaleDetail,
  listSales,
  partialReturn,
  partialReturnSchema,
  voidSale,
} from './billing.service.js';
import {
  createGiftCard,
  giftCardSchema,
  listGiftCards,
  lookupGiftCard,
} from './gift-cards.service.js';
import {
  deleteHeldCart,
  heldCartSchema,
  listHeldCarts,
  saveHeldCart,
} from './held-carts.service.js';
import {
  createDiscount,
  discountSchema,
  getDiscountUsageReport,
  listDiscounts,
  updateDiscount,
} from './discounts.service.js';
import { printSaleSlip } from '../printer/printer.service.js';

export async function registerBillingRoutes(app: FastifyInstance): Promise<void> {
  app.get('/sales', { preHandler: [authenticate, requireFeature(FEATURES.BILLING_CREATE_SALE)] }, async (request) => {
    const tenantId = resolveTenantId(request);
    const q = request.query as { page?: string; pageSize?: string; search?: string };
    return listSales(
      tenantId,
      q.page ? Number(q.page) : 1,
      q.pageSize ? Number(q.pageSize) : 20,
      undefined,
      q.search,
    );
  });

  app.get('/sales/:saleId', { preHandler: [authenticate, requireFeature(FEATURES.BILLING_CREATE_SALE)] }, async (request) => {
    const { saleId } = request.params as { saleId: string };
    return getSaleDetail(resolveTenantId(request), saleId);
  });

  app.post(
    '/sales/:saleId/print-slip',
    {
      preHandler: [
        authenticate,
        requireFeature(FEATURES.BILLING_CREATE_SALE),
        requireFeature(FEATURES.BILLING_PRINT_RECEIPT),
      ],
    },
    async (request) => {
      const { saleId } = request.params as { saleId: string };
      return printSaleSlip(resolveTenantId(request), saleId);
    },
  );

  app.post('/sales', { preHandler: [authenticate, requireFeature(FEATURES.BILLING_CREATE_SALE)] }, async (request) => {
    const tenantId = resolveTenantId(request);
    const parsed = createSaleSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid request body', parsed.error.flatten());

    const settings = await getSettings(tenantId);
    const canUnlimited = request.user!.features.includes(FEATURES.BILLING_DISCOUNT_UNLIMITED);
    const branchId = await resolveBranchId(request, tenantId);

    const hasDiscount =
      (parsed.data.billDiscountAmount ?? 0) > 0 ||
      parsed.data.items.some((i) => (i.discountAmount ?? 0) > 0);

    if (hasDiscount && !request.user!.features.includes(FEATURES.BILLING_DISCOUNT)) {
      throw new ValidationError('Discount feature not enabled');
    }

    return createSale(tenantId, request.user!.id, parsed.data, {
      canDiscountUnlimited: canUnlimited,
      maxDiscountPercent: settings.maxDiscountPercentStaff
        ? Number(settings.maxDiscountPercentStaff)
        : null,
      branchId,
    });
  });

  app.post(
    '/sales/:saleId/void',
    { preHandler: [authenticate, requireFeature(FEATURES.BILLING_VOID_SALE)] },
    async (request) => {
      const tenantId = resolveTenantId(request);
      const { saleId } = request.params as { saleId: string };
      const body = request.body as { reason?: string };
      if (!body?.reason) throw new ValidationError('Void reason is required');
      return voidSale(tenantId, saleId, request.user!.id, body.reason, request.ip);
    },
  );

  app.post(
    '/sales/:saleId/return',
    { preHandler: [authenticate, requireFeature(FEATURES.BILLING_CREATE_SALE)] },
    async (request) => {
      const tenantId = resolveTenantId(request);
      const { saleId } = request.params as { saleId: string };
      const parsed = partialReturnSchema.safeParse(request.body);
      if (!parsed.success) throw new ValidationError('Invalid request body', parsed.error.flatten());
      return partialReturn(tenantId, saleId, request.user!.id, parsed.data);
    },
  );

  app.get('/held-carts', { preHandler: [authenticate, requireFeature(FEATURES.BILLING_CREATE_SALE)] }, async (request) => {
    return listHeldCarts(resolveTenantId(request), request.user!.id);
  });

  app.post('/held-carts', { preHandler: [authenticate, requireFeature(FEATURES.BILLING_CREATE_SALE)] }, async (request) => {
    const tenantId = resolveTenantId(request);
    const parsed = heldCartSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid request body', parsed.error.flatten());
    const branchId = await resolveBranchId(request, tenantId).catch(() => undefined);
    return saveHeldCart(tenantId, request.user!.id, parsed.data, branchId);
  });

  app.delete('/held-carts/:id', { preHandler: [authenticate, requireFeature(FEATURES.BILLING_CREATE_SALE)] }, async (request) => {
    const { id } = request.params as { id: string };
    return deleteHeldCart(resolveTenantId(request), id, request.user!.id);
  });

  app.get('/gift-cards', { preHandler: [authenticate, requireFeature(FEATURES.BILLING_CREATE_SALE)] }, async (request) => {
    return listGiftCards(resolveTenantId(request));
  });

  app.post('/gift-cards', { preHandler: [authenticate, requireFeature(FEATURES.BILLING_CREATE_SALE)] }, async (request) => {
    const parsed = giftCardSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid request body', parsed.error.flatten());
    return createGiftCard(resolveTenantId(request), parsed.data);
  });

  app.get('/gift-cards/lookup/:code', { preHandler: [authenticate, requireFeature(FEATURES.BILLING_CREATE_SALE)] }, async (request) => {
    const { code } = request.params as { code: string };
    return lookupGiftCard(resolveTenantId(request), decodeURIComponent(code));
  });

  app.get('/discounts', { preHandler: [authenticate, requireFeature(FEATURES.BILLING_DISCOUNT)] }, async (request) => {
    const q = request.query as { includeInactive?: string };
    return listDiscounts(resolveTenantId(request), q.includeInactive === 'true');
  });

  app.post('/discounts', { preHandler: [authenticate, requireFeature(FEATURES.BILLING_DISCOUNT)] }, async (request) => {
    const parsed = discountSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid request body', parsed.error.flatten());
    return createDiscount(resolveTenantId(request), parsed.data);
  });

  app.patch('/discounts/:id', { preHandler: [authenticate, requireFeature(FEATURES.BILLING_DISCOUNT)] }, async (request) => {
    const { id } = request.params as { id: string };
    const parsed = discountSchema.partial().safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid request body', parsed.error.flatten());
    return updateDiscount(resolveTenantId(request), id, parsed.data);
  });

  app.get('/discounts/usage-report', { preHandler: [authenticate, requireFeature(FEATURES.BILLING_DISCOUNT)] }, async (request) => {
    const q = request.query as { from?: string; to?: string };
    return getDiscountUsageReport(resolveTenantId(request), q.from, q.to);
  });
}
