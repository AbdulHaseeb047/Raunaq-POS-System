import type { FeatureKey } from '@pos/shared';

/** Short in-memory TTL to cut repeated Railway↔DB round-trips on parallel page loads. */
const TTL_MS = 30_000;

type PortalHit = { ok: true; expiresAt: number } | { ok: false; expiresAt: number; error: unknown };

const portalCache = new Map<string, PortalHit>();
const featureCache = new Map<string, { keys: FeatureKey[]; expiresAt: number }>();

export function getCachedPortalAccess(tenantId: string): PortalHit | null {
  const hit = portalCache.get(tenantId);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    portalCache.delete(tenantId);
    return null;
  }
  return hit;
}

export function setCachedPortalAccessOk(tenantId: string): void {
  portalCache.set(tenantId, { ok: true, expiresAt: Date.now() + TTL_MS });
}

export function setCachedPortalAccessError(tenantId: string, error: unknown): void {
  portalCache.set(tenantId, {
    ok: false,
    expiresAt: Date.now() + Math.min(TTL_MS, 10_000),
    error,
  });
}

export function getCachedUserFeatures(cacheKey: string): FeatureKey[] | null {
  const hit = featureCache.get(cacheKey);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    featureCache.delete(cacheKey);
    return null;
  }
  return hit.keys;
}

export function setCachedUserFeatures(cacheKey: string, keys: FeatureKey[]): void {
  featureCache.set(cacheKey, { keys, expiresAt: Date.now() + TTL_MS });
}

export function invalidateAccessCaches(tenantId?: string): void {
  if (!tenantId) {
    portalCache.clear();
    featureCache.clear();
    return;
  }
  portalCache.delete(tenantId);
  for (const key of featureCache.keys()) {
    if (key.startsWith(`${tenantId}:`)) featureCache.delete(key);
  }
}
