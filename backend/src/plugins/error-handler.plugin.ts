import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { AppError } from '../modules/core/errors.js';

function isHttpError(error: Error): error is Error & { statusCode: number; code?: string } {
  return 'statusCode' in error && typeof (error as { statusCode?: unknown }).statusCode === 'number';
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
    return reply.status(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message:
        process.env.NODE_ENV === 'production'
          ? 'An unexpected error occurred'
          : error.message || 'An unexpected error occurred',
    });
  });
}
