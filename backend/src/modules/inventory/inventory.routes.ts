import type { FastifyInstance } from 'fastify';
import { FEATURES } from '@pos/shared';

import { ValidationError } from '../core/errors.js';
import { resolveTenantId } from '../core/tenant.js';
import { authenticate, requireFeature } from '../permissions/permissions.middleware.js';
import {
  adjustStock,
  categorySchema,
  createCategory,
  createProduct,
  deleteCategory,
  deleteProduct,
  getInventorySummary,
  getProductByBarcode,
  importProducts,
  importProductsSchema,
  listCategories,
  listProducts,
  getMiscOpenProduct,
  productSchema,
  purgeAllProducts,
  stockAdjustSchema,
  updateCategory,
  updateProduct,
} from './inventory.service.js';

export async function registerInventoryRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/categories',
    { preHandler: [authenticate, requireFeature(FEATURES.INVENTORY_CATEGORIES)] },
    async (request) => {
      const q = request.query as { search?: string };
      return listCategories(resolveTenantId(request), q.search);
    },
  );

  app.post(
    '/categories',
    { preHandler: [authenticate, requireFeature(FEATURES.INVENTORY_CATEGORIES)] },
    async (request) => {
      const parsed = categorySchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError('Invalid request body', parsed.error.flatten());
      return createCategory(resolveTenantId(request), parsed.data);
    },
  );

  app.patch(
    '/categories/:id',
    { preHandler: [authenticate, requireFeature(FEATURES.INVENTORY_CATEGORIES)] },
    async (request) => {
      const { id } = request.params as { id: string };
      const parsed = categorySchema.partial().safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError('Invalid request body', parsed.error.flatten());
      return updateCategory(resolveTenantId(request), id, parsed.data);
    },
  );

  app.delete(
    '/categories/:id',
    { preHandler: [authenticate, requireFeature(FEATURES.INVENTORY_CATEGORIES)] },
    async (request) => {
      const { id } = request.params as { id: string };
      return deleteCategory(resolveTenantId(request), id);
    },
  );

  app.get(
    '/products/summary',
    { preHandler: [authenticate, requireFeature(FEATURES.INVENTORY_VIEW)] },
    async (request) => {
      return getInventorySummary(resolveTenantId(request));
    },
  );

  app.get(
    '/products/misc-open',
    { preHandler: [authenticate, requireFeature(FEATURES.BILLING_CREATE_SALE)] },
    async (request) => {
      return getMiscOpenProduct(resolveTenantId(request));
    },
  );

  app.get(
    '/products',
    { preHandler: [authenticate, requireFeature(FEATURES.INVENTORY_VIEW)] },
    async (request) => {
      const q = request.query as {
        search?: string;
        categoryId?: string;
        brandId?: string;
        stockStatus?: 'all' | 'healthy' | 'low' | 'out';
        page?: string;
        pageSize?: string;
        activeOnly?: string;
        skipCount?: string;
      };
      return listProducts(resolveTenantId(request), {
        search: q.search,
        categoryId: q.categoryId,
        brandId: q.brandId,
        stockStatus: q.stockStatus,
        page: q.page ? Number(q.page) : 1,
        pageSize: q.pageSize ? Number(q.pageSize) : 50,
        activeOnly: q.activeOnly === 'true' || q.activeOnly === '1',
        skipCount: q.skipCount === 'true' || q.skipCount === '1',
      });
    },
  );

  app.get(
    '/products/barcode/:barcode',
    { preHandler: [authenticate, requireFeature(FEATURES.INVENTORY_VIEW)] },
    async (request) => {
      const { barcode } = request.params as { barcode: string };
      return getProductByBarcode(resolveTenantId(request), decodeURIComponent(barcode));
    },
  );

  app.post(
    '/products',
    { preHandler: [authenticate, requireFeature(FEATURES.INVENTORY_EDIT)] },
    async (request) => {
      const parsed = productSchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError('Invalid request body', parsed.error.flatten());
      return createProduct(resolveTenantId(request), parsed.data);
    },
  );

  app.patch(
    '/products/:id',
    { preHandler: [authenticate, requireFeature(FEATURES.INVENTORY_EDIT)] },
    async (request) => {
      const { id } = request.params as { id: string };
      const parsed = productSchema.partial().safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError('Invalid request body', parsed.error.flatten());
      return updateProduct(resolveTenantId(request), id, parsed.data);
    },
  );

  app.delete(
    '/products/:id',
    { preHandler: [authenticate, requireFeature(FEATURES.INVENTORY_EDIT)] },
    async (request) => {
      const { id } = request.params as { id: string };
      return deleteProduct(resolveTenantId(request), id);
    },
  );

  app.post(
    '/products/import',
    { preHandler: [authenticate, requireFeature(FEATURES.INVENTORY_EDIT)] },
    async (request) => {
      const parsed = importProductsSchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError('Invalid request body', parsed.error.flatten());
      return importProducts(resolveTenantId(request), parsed.data);
    },
  );

  app.delete(
    '/products',
    { preHandler: [authenticate, requireFeature(FEATURES.INVENTORY_EDIT)] },
    async (request) => {
      const q = request.query as { confirm?: string };
      if (q.confirm !== 'true') {
        throw new ValidationError('Add ?confirm=true to purge all inventory');
      }
      return purgeAllProducts(resolveTenantId(request));
    },
  );

  app.post(
    '/products/:id/stock',
    { preHandler: [authenticate, requireFeature(FEATURES.INVENTORY_STOCK_ADJUST)] },
    async (request) => {
      const { id } = request.params as { id: string };
      const parsed = stockAdjustSchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError('Invalid request body', parsed.error.flatten());
      return adjustStock(resolveTenantId(request), id, parsed.data, request.user!.id);
    },
  );
}
