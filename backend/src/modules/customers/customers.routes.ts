import type { FastifyInstance } from 'fastify';
import { FEATURES } from '@pos/shared';

import { ValidationError } from '../core/errors.js';
import { resolveTenantId } from '../core/tenant.js';
import { authenticate, requireFeature } from '../permissions/permissions.middleware.js';
import {
  createCustomer,
  customerSchema,
  deleteCustomer,
  fetchCustomerLedger,
  getCustomer,
  listCustomers,
  recordCustomerPayment,
  recordPaymentSchema,
  updateCustomer,
  voidCustomerLedgerEntry,
} from './customers.service.js';

export async function registerCustomerRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/customers',
    { preHandler: [authenticate, requireFeature(FEATURES.CUSTOMERS_VIEW)] },
    async (request) => {
      const q = request.query as {
        search?: string;
        page?: string;
        pageSize?: string;
        sortBy?: string;
        from?: string;
        to?: string;
      };
      return listCustomers(
        resolveTenantId(request),
        q.search,
        q.page ? Number(q.page) : 1,
        q.pageSize ? Number(q.pageSize) : 50,
        q.sortBy === 'balance' ? 'balance' : 'name',
        q.from,
        q.to,
      );
    },
  );

  app.get(
    '/customers/:id',
    { preHandler: [authenticate, requireFeature(FEATURES.CUSTOMERS_VIEW)] },
    async (request) => {
      const { id } = request.params as { id: string };
      return getCustomer(resolveTenantId(request), id);
    },
  );

  app.post(
    '/customers',
    { preHandler: [authenticate, requireFeature(FEATURES.CUSTOMERS_EDIT)] },
    async (request) => {
      const parsed = customerSchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError('Invalid request body', parsed.error.flatten());
      return createCustomer(resolveTenantId(request), parsed.data);
    },
  );

  app.patch(
    '/customers/:id',
    { preHandler: [authenticate, requireFeature(FEATURES.CUSTOMERS_EDIT)] },
    async (request) => {
      const { id } = request.params as { id: string };
      const parsed = customerSchema.partial().safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError('Invalid request body', parsed.error.flatten());
      return updateCustomer(resolveTenantId(request), id, parsed.data);
    },
  );

  app.delete(
    '/customers/:id',
    { preHandler: [authenticate, requireFeature(FEATURES.CUSTOMERS_EDIT)] },
    async (request) => {
      const { id } = request.params as { id: string };
      return deleteCustomer(resolveTenantId(request), id);
    },
  );

  app.get(
    '/customers/:id/ledger',
    { preHandler: [authenticate, requireFeature(FEATURES.CUSTOMERS_LEDGER_VIEW)] },
    async (request) => {
      const { id } = request.params as { id: string };
      return fetchCustomerLedger(resolveTenantId(request), id);
    },
  );

  app.post(
    '/customers/:id/payments',
    { preHandler: [authenticate, requireFeature(FEATURES.CUSTOMERS_LEDGER_RECORD)] },
    async (request) => {
      const { id } = request.params as { id: string };
      const parsed = recordPaymentSchema.safeParse(request.body);
      if (!parsed.success)
        throw new ValidationError('Invalid request body', parsed.error.flatten());
      return recordCustomerPayment(resolveTenantId(request), id, parsed.data, request.user!.id);
    },
  );

  app.post(
    '/customers/:id/ledger/:entryId/void',
    { preHandler: [authenticate, requireFeature(FEATURES.CUSTOMERS_LEDGER_EDIT)] },
    async (request) => {
      const { id, entryId } = request.params as { id: string; entryId: string };
      const body = request.body as { reason?: string };
      if (!body?.reason) throw new ValidationError('Void reason is required');
      return voidCustomerLedgerEntry(
        resolveTenantId(request),
        id,
        entryId,
        request.user!.id,
        body.reason,
        request.ip,
      );
    },
  );
}
