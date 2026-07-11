import type { SyncWorkerConfig } from './sync-config.js';

export class SyncCloudError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'SyncCloudError';
  }
}

export interface IngestApiResponse {
  results: Array<{
    outboxId: string;
    status: 'accepted' | 'skipped' | 'conflict' | 'failed';
    reason?: string;
  }>;
}

export interface ChangesApiResponse {
  changes: Array<{
    id: string;
    tableName: string;
    recordId: string;
    operation: 'INSERT' | 'UPDATE' | 'DELETE';
    payload: Record<string, unknown>;
    recordVersion: number;
    createdAt: string;
  }>;
  nextCursor: string | null;
}

export async function postCloudIngest(
  config: SyncWorkerConfig,
  body: {
    tenantId: string;
    deviceId?: string | null;
    entries: Array<{
      outboxId: string;
      tableName: string;
      recordId: string;
      operation: string;
      payload: Record<string, unknown>;
      recordVersion: number;
      createdAt: string;
    }>;
  },
): Promise<IngestApiResponse> {
  const response = await fetch(`${config.cloudApiUrl}/sync/ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Sync-Api-Key': config.apiKey!,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new SyncCloudError(
      parsed.message ?? `Cloud ingest failed (${response.status})`,
      response.status,
      parsed,
    );
  }

  return parsed as IngestApiResponse;
}

export async function getCloudChanges(
  config: SyncWorkerConfig,
  params: { tenantId: string; cursor: string | null; limit: number; deviceId?: string | null },
): Promise<ChangesApiResponse> {
  const url = new URL(`${config.cloudApiUrl}/sync/changes`);
  url.searchParams.set('tenantId', params.tenantId);
  url.searchParams.set('limit', String(params.limit));
  if (params.cursor) url.searchParams.set('cursor', params.cursor);
  if (params.deviceId) url.searchParams.set('excludeDeviceId', params.deviceId);

  const response = await fetch(url, {
    headers: { 'X-Sync-Api-Key': config.apiKey! },
  });

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new SyncCloudError(
      parsed.message ?? `Cloud pull failed (${response.status})`,
      response.status,
      parsed,
    );
  }

  return parsed as ChangesApiResponse;
}

export interface CloudRecordResponse {
  tableName: string;
  recordId: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: Record<string, unknown>;
  recordVersion: number;
}

export async function fetchCloudRecord(
  config: SyncWorkerConfig,
  tenantId: string,
  tableName: string,
  recordId: string,
): Promise<CloudRecordResponse | null> {
  const url = new URL(`${config.cloudApiUrl}/sync/records/${tableName}/${recordId}`);
  url.searchParams.set('tenantId', tenantId);

  const response = await fetch(url, {
    headers: { 'X-Sync-Api-Key': config.apiKey! },
  });

  if (response.status === 404) return null;

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new SyncCloudError(
      parsed.message ?? `Cloud record fetch failed (${response.status})`,
      response.status,
      parsed,
    );
  }

  return parsed as CloudRecordResponse;
}

export async function probeCloudHealth(config: SyncWorkerConfig): Promise<boolean> {
  try {
    const response = await fetch(`${config.cloudApiUrl}/health`, { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
}
