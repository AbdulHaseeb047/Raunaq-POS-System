import { PrismaClient } from '@prisma/client';

import { getTenantContext } from './tenant-context.js';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/** Models that always carry tenant_id and should be auto-scoped when context is set. */
const TENANT_SCOPED_MODELS = new Set([
  'Category',
  'Brand',
  'Supplier',
  'SupplierLedgerEntry',
  'Product',
  'StockMovement',
  'Customer',
  'CustomerLedgerEntry',
  'CustomerCreditObligation',
  'CustomerPaymentAllocation',
  'Sale',
  'SaleItem',
  'SalePayment',
  'HeldCart',
  'GiftCard',
  'SaleReturn',
  'SaleReturnItem',
  'DiscountRule',
  'DiscountUsage',
  'BusinessSettings',
  'Branch',
  'SaleSequence',
  'SyncOutbox',
  'SyncState',
  'SyncChangelog',
  'SyncDevice',
  'TenantFeature',
  'LicenseActivation',
  'AuditLog',
]);

function injectTenantWhere<T extends { where?: Record<string, unknown> }>(
  model: string,
  args: T,
): T {
  const ctx = getTenantContext();
  if (!ctx?.tenantId || ctx.bypass || !TENANT_SCOPED_MODELS.has(model)) return args;
  const where = args.where ?? {};
  if ('tenantId' in where) return args;
  return { ...args, where: { ...where, tenantId: ctx.tenantId } };
}

function injectTenantData<T extends { data?: Record<string, unknown> | Record<string, unknown>[] }>(
  model: string,
  args: T,
): T {
  const ctx = getTenantContext();
  if (!ctx?.tenantId || ctx.bypass || !TENANT_SCOPED_MODELS.has(model) || !args.data) return args;
  if (Array.isArray(args.data)) {
    return {
      ...args,
      data: args.data.map((row) => ('tenantId' in row ? row : { ...row, tenantId: ctx.tenantId })),
    };
  }
  if ('tenantId' in args.data) return args;
  return { ...args, data: { ...args.data, tenantId: ctx.tenantId } };
}

function createPrismaClient(): PrismaClient {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

  return base.$extends({
    name: 'tenantRls',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          let next = args as Record<string, unknown>;
          if (
            operation === 'findMany' ||
            operation === 'findFirst' ||
            operation === 'findUnique' ||
            operation === 'count' ||
            operation === 'aggregate' ||
            operation === 'groupBy' ||
            operation === 'update' ||
            operation === 'updateMany' ||
            operation === 'delete' ||
            operation === 'deleteMany'
          ) {
            next = injectTenantWhere(model, next as { where?: Record<string, unknown> });
          }
          if (operation === 'create' || operation === 'createMany') {
            next = injectTenantData(model, next as { data?: Record<string, unknown> });
          }
          if (operation === 'upsert') {
            next = injectTenantWhere(model, next as { where?: Record<string, unknown> });
            const ctx = getTenantContext();
            if (ctx?.tenantId && !ctx.bypass && TENANT_SCOPED_MODELS.has(model)) {
              const upsertArgs = next as {
                create?: Record<string, unknown>;
                update?: Record<string, unknown>;
              };
              if (upsertArgs.create && !('tenantId' in upsertArgs.create)) {
                upsertArgs.create = { ...upsertArgs.create, tenantId: ctx.tenantId };
              }
            }
          }
          return query(next);
        },
      },
    },
  }) as unknown as PrismaClient;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export type TransactionClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
