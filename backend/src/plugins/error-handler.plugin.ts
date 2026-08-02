import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { AppError } from '../modules/core/errors.js';

function isHttpError(error: Error): error is Error & { statusCode: number; code?: string } {
  return (
    'statusCode' in error && typeof (error as { statusCode?: unknown }).statusCode === 'number'
  );
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: Error, _request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        error: error.name,
        message: error.message,
        code: error.code,
        details: error.details,
      });
    }

    if (isHttpError(error) && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        error: error.name || 'Request Error',
        message: error.message,
        code: error.code,
      });
    }

    app.log.error(error);

    const prismaCode =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code ?? '')
        : '';

    // Surface actionable DB/RLS hints in production (still no stack traces).
    let message = 'An unexpected error occurred';
    if (process.env.NODE_ENV !== 'production') {
      message = error.message || message;
    } else if (/duplicate|already exists|unique constraint/i.test(error.message)) {
      message = 'A record with this name already exists';
    } else if (
      prismaCode === 'P2028' ||
      /Transaction already closed|expired transaction/i.test(error.message)
    ) {
      message =
        'Sale timed out talking to the database. Redeploy with the latest backend (longer TX timeout) and prefer a DB region close to Railway.';
    } else if (
      /sale_quick_pick_ids|dashboard_layout|saleQuickPickIds|dashboardLayout/i.test(error.message)
    ) {
      message =
        'Database is missing layout columns. Run prisma migrate deploy (ui_customize_layout), redeploy API, then retry Customize.';
    } else if (
      /name_compact|phone_compact|sku_compact|barcode_compact|email_compact/i.test(error.message)
    ) {
      message =
        'Database is missing search indexes. Redeploy API after migrate deploy completes, then retry.';
    } else if (prismaCode === 'P2010' || /column .* does not exist/i.test(error.message)) {
      message =
        'Database schema is out of date. Run prisma migrate deploy, redeploy API, then retry.';
    } else if (
      prismaCode.startsWith('P') ||
      /row-level security|RLS|set_config/i.test(error.message)
    ) {
      message =
        'Database rejected the request (RLS/connection). Ensure migrate deploy ran and DATABASE_URL is not a transaction pooler (:6543).';
    } else if (/prepared statement|pgbouncer|40P01/i.test(error.message)) {
      message =
        'Database pooler error. Use a direct or session-mode DATABASE_URL (port 5432), not transaction mode.';
    }

    return reply.status(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message,
      code: prismaCode || 'INTERNAL_ERROR',
    });
  });
}
