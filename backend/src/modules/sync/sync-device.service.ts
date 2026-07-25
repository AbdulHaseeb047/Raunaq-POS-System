import { createHash, randomBytes } from 'node:crypto';

import { ConflictError, ForbiddenError, NotFoundError } from '../core/errors.js';
import { prisma } from '../core/prisma.js';

export interface AuthenticatedSyncDevice {
  id: string;
  tenantId: string;
  deviceId: string;
}

export function hashSyncApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

export function generateSyncApiKey(): string {
  return randomBytes(32).toString('base64url');
}

export async function registerSyncDevice(
  tenantId: string,
  deviceId: string,
  label?: string,
): Promise<{ deviceId: string; apiKey: string }> {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, deletedAt: null, isActive: true },
  });
  if (!tenant) throw new NotFoundError('Tenant not found');

  const existing = await prisma.syncDevice.findUnique({
    where: { tenantId_deviceId: { tenantId, deviceId } },
  });
  if (existing) {
    throw new ConflictError('Sync device already registered for this tenant');
  }

  const apiKey = generateSyncApiKey();
  await prisma.syncDevice.create({
    data: {
      tenantId,
      deviceId,
      label: label ?? null,
      apiKeyHash: hashSyncApiKey(apiKey),
      isActive: true,
    },
  });

  return { deviceId, apiKey };
}

export async function authenticateSyncDevice(
  apiKey: string,
): Promise<AuthenticatedSyncDevice | null> {
  const device = await prisma.syncDevice.findFirst({
    where: { apiKeyHash: hashSyncApiKey(apiKey), isActive: true },
    select: { id: true, tenantId: true, deviceId: true },
  });

  if (!device) return null;

  await prisma.syncDevice.update({
    where: { id: device.id },
    data: { lastSeenAt: new Date() },
  });

  return device;
}

export function assertSyncDeviceBinding(
  device: AuthenticatedSyncDevice,
  tenantId: string,
  deviceId: string,
): void {
  if (tenantId !== device.tenantId) {
    throw new ForbiddenError(
      'tenantId does not match authenticated sync device',
      'SYNC_TENANT_MISMATCH',
    );
  }
  if (deviceId !== device.deviceId) {
    throw new ForbiddenError(
      'deviceId does not match authenticated sync device',
      'SYNC_DEVICE_MISMATCH',
    );
  }
}
