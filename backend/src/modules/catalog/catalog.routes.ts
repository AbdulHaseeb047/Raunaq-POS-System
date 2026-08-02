import type { FastifyInstance } from 'fastify';
import { FEATURES } from '@pos/shared';

import { ValidationError } from '../core/errors.js';
import { resolveTenantId } from '../core/tenant.js';
import { resolveBranchId } from '../core/branch.js';
import { authenticate, requireFeature } from '../permissions/permissions.middleware.js';
import {
  brandSchema,
  createBrand,
  createSupplier,
  deleteBrand,
  deleteSupplier,
  listBrands,
  listSuppliers,
  supplierPaymentSchema,
  supplierSchema,
  supplierStockIn,
  supplierStockInSchema,
  updateBrand,
  updateSupplier,
} from './catalog.service.js';
import {
  getSupplierLedger,
  getSupplier,
  recordSupplierPayment,
} from './supplier-ledger.service.js';

export async function registerCatalogRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/brands',
    { preHandler: [authenticate, requireFeature(FEATURES.INVENTORY_BRANDS)] },
    async (request) => {
      const q = request.query as { search?: string };
      return listBrands(resolveTenantId(request), q.search);
    },
  );

  app.post(
    '/brands',
    { preHandler: [authenticate, requireFeature(FEATURES.INVENTORY_BRANDS)] },
    async (request) => {
      const parsed = brandSchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError('Invalid request body', parsed.error.flatten());
      return createBrand(resolveTenantId(request), parsed.data);
    },
  );

  app.patch(
    '/brands/:id',
    { preHandler: [authenticate, requireFeature(FEATURES.INVENTORY_BRANDS)] },
    async (request) => {
      const { id } = request.params as { id: string };
      const parsed = brandSchema.partial().safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError('Invalid request body', parsed.error.flatten());
      return updateBrand(resolveTenantId(request), id, parsed.data);
    },
  );

  app.delete(
    '/brands/:id',
    { preHandler: [authenticate, requireFeature(FEATURES.INVENTORY_BRANDS)] },
    async (request) => {
      const { id } = request.params as { id: string };
      return deleteBrand(resolveTenantId(request), id);
    },
  );

  app.get(
    '/suppliers',
    { preHandler: [authenticate, requireFeature(FEATURES.INVENTORY_SUPPLIERS)] },
    async (request) => {
      const q = request.query as { search?: string };
      return listSuppliers(resolveTenantId(request), q.search);
    },
  );

  app.post(
    '/suppliers',
    { preHandler: [authenticate, requireFeature(FEATURES.INVENTORY_SUPPLIERS)] },
    async (request) => {
      const parsed = supplierSchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError('Invalid request body', parsed.error.flatten());
      return createSupplier(resolveTenantId(request), parsed.data);
    },
  );

  app.patch(
    '/suppliers/:id',
    { preHandler: [authenticate, requireFeature(FEATURES.INVENTORY_SUPPLIERS)] },
    async (request) => {
      const { id } = request.params as { id: string };
      const parsed = supplierSchema.partial().safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError('Invalid request body', parsed.error.flatten());
      return updateSupplier(resolveTenantId(request), id, parsed.data);
    },
  );

  app.delete(
    '/suppliers/:id',
    { preHandler: [authenticate, requireFeature(FEATURES.INVENTORY_SUPPLIERS)] },
    async (request) => {
      const { id } = request.params as { id: string };
      return deleteSupplier(resolveTenantId(request), id);
    },
  );

  app.get(
    '/suppliers/:id/ledger',
    { preHandler: [authenticate, requireFeature(FEATURES.INVENTORY_SUPPLIERS)] },
    async (request) => {
      const { id } = request.params as { id: string };
      return getSupplierLedger(resolveTenantId(request), id);
    },
  );

  app.post(
    '/suppliers/:id/stock-in',
    { preHandler: [authenticate, requireFeature(FEATURES.INVENTORY_SUPPLIERS)] },
    async (request) => {
      const tenantId = resolveTenantId(request);
      const { id } = request.params as { id: string };
      const parsed = supplierStockInSchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError('Invalid request body', parsed.error.flatten());
      const branchId = await resolveBranchId(request, tenantId);
      return supplierStockIn(tenantId, id, parsed.data, request.user!.id, branchId);
    },
  );

  app.post(
    '/suppliers/:id/payments',
    { preHandler: [authenticate, requireFeature(FEATURES.INVENTORY_SUPPLIERS)] },
    async (request) => {
      const tenantId = resolveTenantId(request);
      const { id } = request.params as { id: string };
      const parsed = supplierPaymentSchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError('Invalid request body', parsed.error.flatten());
      await recordSupplierPayment(
        tenantId,
        id,
        parsed.data.amount,
        parsed.data.paymentMethod,
        parsed.data.notes,
        request.user!.id,
      );
      return getSupplier(tenantId, id);
    },
  );
}
