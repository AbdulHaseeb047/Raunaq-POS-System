import { prisma } from './prisma.js';
import { enterTenantContext, type TenantContext } from './tenant-context.js';

/**
 * Session-var RLS is optional. With FORCE RLS off (hotfix migration), the app DB
 * role already bypasses policies; SET CONFIG on every request adds 2+ round-trips
 * to a remote Supabase pooler and was blowing the 5s sale transaction timeout.
 *
 * Set ENABLE_RLS_SESSION=true only if you use a non-owner DB role with FORCE RLS.
 */
function rlsSessionEnabled(): boolean {
  return process.env.ENABLE_RLS_SESSION === 'true';
}

export async function applyRlsSession(ctx: TenantContext): Promise<void> {
  if (!rlsSessionEnabled()) return;
  const tenantId = ctx.tenantId ?? '';
  const bypass = ctx.bypass ? 'true' : 'false';
  await prisma.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, false)`;
  await prisma.$executeRaw`SELECT set_config('app.bypass_rls', ${bypass}, false)`;
}

export async function clearRlsSession(): Promise<void> {
  if (!rlsSessionEnabled()) return;
  try {
    await prisma.$executeRaw`SELECT set_config('app.current_tenant_id', '', false)`;
    await prisma.$executeRaw`SELECT set_config('app.bypass_rls', 'false', false)`;
  } catch {
    // Connection may already be closed at end of request.
  }
}

export async function applyRlsLocal(
  tx: { $executeRaw: typeof prisma.$executeRaw },
  ctx: TenantContext,
): Promise<void> {
  if (!rlsSessionEnabled()) return;
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
