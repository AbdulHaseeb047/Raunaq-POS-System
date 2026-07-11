import type { FastifyBaseLogger } from 'fastify';

import { probeCloudHealth } from './cloud-client.js';
import { pullRemoteChanges } from './pull.service.js';
import { pushPendingOutbox } from './push.service.js';
import { getSyncWorkerConfig, isHybridWorkerConfigured, type SyncWorkerConfig } from './sync-config.js';

export interface SyncCycleSummary {
  online: boolean;
  push: Awaited<ReturnType<typeof pushPendingOutbox>> | null;
  pull: Awaited<ReturnType<typeof pullRemoteChanges>> | null;
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let cycleRunning = false;

export async function runSyncCycle(
  config: SyncWorkerConfig = getSyncWorkerConfig(),
  logger?: FastifyBaseLogger,
): Promise<SyncCycleSummary | null> {
  if (!isHybridWorkerConfigured(config)) return null;
  if (cycleRunning) return null;

  cycleRunning = true;
  try {
    const online = await probeCloudHealth(config);
    if (!online) {
      logger?.debug('Sync cycle skipped — cloud unreachable');
      return { online: false, push: null, pull: null };
    }

    const push = await pushPendingOutbox(config);
    const pull = await pullRemoteChanges(config);

    logger?.info({ push, pull }, 'Sync cycle completed');
    return { online: true, push, pull };
  } catch (error) {
    logger?.error({ err: error }, 'Sync cycle failed');
    return { online: false, push: null, pull: null };
  } finally {
    cycleRunning = false;
  }
}

export function startSyncWorker(logger?: FastifyBaseLogger): void {
  const config = getSyncWorkerConfig();
  if (!isHybridWorkerConfigured(config)) {
    logger?.warn(
      'Hybrid sync worker not started — set SYNC_CLOUD_URL, SYNC_API_KEY, SYNC_DEVICE_ID, and TENANT_ID',
    );
    return;
  }

  if (intervalHandle) return;

  logger?.info({ intervalMs: config.intervalMs }, 'Starting hybrid sync worker');

  void runSyncCycle(config, logger);

  intervalHandle = setInterval(() => {
    void runSyncCycle(config, logger);
  }, config.intervalMs);
}

export function stopSyncWorker(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

export function isSyncWorkerRunning(): boolean {
  return intervalHandle !== null;
}
