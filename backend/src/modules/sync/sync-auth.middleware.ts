import type { FastifyReply, FastifyRequest } from 'fastify';

import { UnauthorizedError } from '../core/errors.js';
import { authenticateSyncDevice } from './sync-device.service.js';

export async function requireSyncApiKey(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const provided = request.headers['x-sync-api-key'];
  if (typeof provided !== 'string' || provided.length === 0) {
    throw new UnauthorizedError('Sync API key required');
  }

  const device = await authenticateSyncDevice(provided);
  if (!device) {
    throw new UnauthorizedError('Invalid sync API key');
  }

  request.syncDevice = device;
}
