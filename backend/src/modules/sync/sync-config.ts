/** Hybrid sync worker configuration — read at runtime, no required env at import. */
export interface SyncWorkerConfig {
  cloudApiUrl: string | null;
  apiKey: string | null;
  tenantId: string | null;
  deviceId: string | null;
  intervalMs: number;
  batchSize: number;
  maxFailedRetries: number;
}

export function getSyncWorkerConfig(): SyncWorkerConfig {
  const cloudApiUrl = process.env.SYNC_CLOUD_URL?.replace(/\/$/, '') ?? null;
  return {
    cloudApiUrl,
    apiKey: process.env.SYNC_API_KEY ?? null,
    tenantId: process.env.TENANT_ID || null,
    deviceId: process.env.SYNC_DEVICE_ID ?? null,
    intervalMs: parseInt(process.env.SYNC_INTERVAL_MS ?? '30000', 10),
    batchSize: parseInt(process.env.SYNC_BATCH_SIZE ?? '50', 10),
    maxFailedRetries: parseInt(process.env.SYNC_MAX_FAILED_RETRIES ?? '5', 10),
  };
}

export function isHybridWorkerConfigured(
  config: SyncWorkerConfig = getSyncWorkerConfig(),
): boolean {
  return (
    process.env.DEPLOYMENT_MODE === 'hybrid' &&
    Boolean(config.cloudApiUrl && config.apiKey && config.tenantId && config.deviceId)
  );
}

/** Cloud exposes ingest/pull when running as the sync hub. Device auth uses sync_devices rows. */
export function isCloudIngestEnabled(): boolean {
  return process.env.DEPLOYMENT_MODE === 'cloud';
}
