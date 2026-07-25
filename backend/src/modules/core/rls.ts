import { prisma } from './prisma.js';
import { enterTenantContext, type TenantContext } from './tenant-context.js';

/**
 * Sets Postgres session vars used by RLS policies.
 * Requires DATABASE_URL on a direct or session-mode pooler (not transaction pooler :6543).
 */
export async function applyRlsSession(ctx: TenantContext): Promise<void> {
  const tenantId = ctx.tenantId ?? '';
  const bypass = ctx.bypass ? 'true' : 'false';
  await prisma.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, false)`;
  await prisma.$executeRaw`SELECT set_config('app.bypass_rls', ${bypass}, false)`;
}

export async function clearRlsSession(): Promise<void> {
  try {
    await prisma.$executeRaw`SELECT set_config('app.current_tenant_id', '', false)`;
    await prisma.$executeRaw`SELECT set_config('app.bypass_rls', 'false', false)`;
  } catch {
    // Connection may already be closed at end of request.
  }
}

/** Apply RLS vars inside an interactive transaction (SET LOCAL — safe with poolers). */
export async function applyRlsLocal(
  tx: { $executeRaw: typeof prisma.$executeRaw },
  ctx: TenantContext,
): Promise<void> {
  const tenantId = ctx.tenantId ?? '';
  const bypass = ctx.bypass ? 'true' : 'false';
  await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
  await tx.$executeRaw`SELECT set_config('app.bypass_rls', ${bypass}, true)`;
}

/** Login, seed, and background jobs — temporarily bypass RLS. */
export async function withRlsBypass<T>(fn: () => Promise<T>): Promise<T> {
  const ctx: TenantContext = { tenantId: null, bypass: true };
  enterTenantContext(ctx);
  await applyRlsSession(ctx);
  try {
    return await fn();
  } finally {
    await clearRlsSession();
  }
}
