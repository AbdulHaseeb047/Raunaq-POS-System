import type { FastifyInstance } from 'fastify';
import { FEATURES } from '@pos/shared';

import { resolveBranchId } from '../core/branch.js';
import { resolveTenantId } from '../core/tenant.js';
import { authenticate, requireFeature } from '../permissions/permissions.middleware.js';
import {
  getDailySalesReport,
  getDashboardSummary,
  getSalesSummary,
  getSalesTrend,
  getStaffPerformanceReport,
  getStockMovementReport,
  getUdhaarAgingReport,
} from './reports.service.js';

async function optionalBranchId(
  request: Parameters<typeof resolveTenantId>[0],
  tenantId: string,
  queryBranchId?: string,
): Promise<string | undefined> {
  if (queryBranchId) return queryBranchId;
  try {
    return await resolveBranchId(request, tenantId);
  } catch {
    return undefined;
  }
}

export async function registerReportRoutes(app: FastifyInstance): Promise<void> {
  // Home dashboard is available on every active plan (including Starter).
  // Full Reports pages stay behind REPORTS_VIEW / REPORTS_ADVANCED.
  app.get('/reports/dashboard', { preHandler: [authenticate] }, async (request) => {
    const tenantId = resolveTenantId(request);
    const q = request.query as { branchId?: string; from?: string; to?: string };
    const branchId = await optionalBranchId(request, tenantId, q.branchId);
    return getDashboardSummary(tenantId, branchId, q.from, q.to);
  });

  app.get(
    '/reports/daily-sales',
    { preHandler: [authenticate, requireFeature(FEATURES.REPORTS_VIEW)] },
    async (request) => {
      const tenantId = resolveTenantId(request);
      const q = request.query as { date?: string; branchId?: string };
      const branchId = await optionalBranchId(request, tenantId, q.branchId);
      return getDailySalesReport(tenantId, q.date, branchId);
    },
  );

  app.get(
    '/reports/udhaar-aging',
    { preHandler: [authenticate, requireFeature(FEATURES.REPORTS_ADVANCED)] },
    async (request) => {
      return getUdhaarAgingReport(resolveTenantId(request));
    },
  );

  app.get(
    '/reports/sales-summary',
    { preHandler: [authenticate, requireFeature(FEATURES.REPORTS_VIEW)] },
    async (request) => {
      const tenantId = resolveTenantId(request);
      const q = request.query as { from?: string; to?: string; branchId?: string };
      const branchId = await optionalBranchId(request, tenantId, q.branchId);
      return getSalesSummary(tenantId, q.from, q.to, branchId);
    },
  );

  app.get(
    '/reports/sales-trend',
    { preHandler: [authenticate, requireFeature(FEATURES.REPORTS_VIEW)] },
    async (request) => {
      const tenantId = resolveTenantId(request);
      const q = request.query as { days?: string; branchId?: string };
      const branchId = await optionalBranchId(request, tenantId, q.branchId);
      const days = q.days ? Number(q.days) : 14;
      return getSalesTrend(tenantId, Number.isFinite(days) ? days : 14, branchId);
    },
  );

  app.get(
    '/reports/stock-movement',
    { preHandler: [authenticate, requireFeature(FEATURES.REPORTS_VIEW)] },
    async (request) => {
      const tenantId = resolveTenantId(request);
      const q = request.query as { from?: string; to?: string; limit?: string };
      const limit = q.limit ? Number(q.limit) : 100;
      return getStockMovementReport(tenantId, q.from, q.to, Number.isFinite(limit) ? limit : 100);
    },
  );

  app.get(
    '/reports/staff-performance',
    { preHandler: [authenticate, requireFeature(FEATURES.REPORTS_ADVANCED)] },
    async (request) => {
      const tenantId = resolveTenantId(request);
      const q = request.query as { from?: string; to?: string };
      return getStaffPerformanceReport(tenantId, q.from, q.to);
    },
  );
}
